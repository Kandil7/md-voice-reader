import io
import json
import os
import socket
import sys
import tempfile
import threading
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tts import AudioChunk  # noqa: E402
from worker import Worker, parse_request, run  # noqa: E402


class FakeSynth:
    def __init__(self, chunks=3, hold=None):
        self._chunks = chunks
        self._hold = hold

    def synthesize(self, text, length_scale, cancel):
        if self._hold is not None:
            self._hold.wait(2.0)
        for _ in range(self._chunks):
            if cancel.is_set():
                return
            yield AudioChunk(b"\x00\x00" * 8, 22050)

    def close(self):
        pass


class FakePlayer:
    def __init__(self, delay=0.0):
        self.delay = delay
        self.active = 0
        self.max_active = 0
        self.overlap = False
        self.completed = 0
        self._lock = threading.Lock()
        self._device = threading.Lock()

    def play(self, chunks, cancel):
        with self._device:
            with self._lock:
                self.active += 1
                self.max_active = max(self.max_active, self.active)
                if self.active > 1:
                    self.overlap = True
            try:
                for _ in chunks:
                    if cancel.is_set():
                        return False
                    if self.delay:
                        time.sleep(self.delay)
                if cancel.is_set():
                    return False
                self.completed += 1
                return True
            finally:
                with self._lock:
                    self.active -= 1

    def stop(self):
        pass

    def close(self):
        pass


def make_worker(max_chars=2000, chunks=3, hold=None, delay=0.0):
    out = io.StringIO()
    synths = []
    players = []

    def synth_factory():
        synth = FakeSynth(chunks=chunks, hold=hold)
        synths.append(synth)
        return synth

    def player_factory():
        player = FakePlayer(delay=delay)
        players.append(player)
        return player

    worker = Worker(synth_factory, player_factory, max_chars, out=out)
    return worker, synths, players, out


def responses(out):
    return [json.loads(line) for line in out.getvalue().splitlines() if line.strip()]


def wait_job(worker, timeout=2.0):
    job = worker._active
    if job is not None and job.thread is not None:
        job.thread.join(timeout)


class TestProtocol(unittest.TestCase):
    def test_parse_valid_and_invalid(self):
        self.assertEqual(parse_request('{"id":1,"type":"stop"}')["type"], "stop")
        with self.assertRaises(ValueError):
            parse_request("not json")
        with self.assertRaises(ValueError):
            parse_request("[1,2,3]")

    def test_unknown_type_errors_without_crashing(self):
        worker, _, _, out = make_worker()
        worker.handle({"id": 1, "type": "banana"})
        self.assertEqual(responses(out)[0]["type"], "error")

    def test_health_reports_platform(self):
        worker, _, _, out = make_worker()
        worker.handle({"id": 7, "type": "health"})
        result = responses(out)[0]
        self.assertEqual(result["type"], "health")
        self.assertIn("platform", result["checks"])


class TestLifecycle(unittest.TestCase):
    def test_model_loaded_once(self):
        worker, synths, players, out = make_worker()
        worker.handle({"id": 1, "type": "speak", "text": "hello"})
        wait_job(worker)
        worker.handle({"id": 2, "type": "speak", "text": "world"})
        wait_job(worker)
        self.assertEqual(len(synths), 1)
        self.assertEqual(len(players), 1)
        self.assertEqual([r["type"] for r in responses(out)].count("finished"), 2)

    def test_oversized_rejected(self):
        worker, _, _, out = make_worker(max_chars=5)
        worker.handle({"id": 1, "type": "speak", "text": "abcdefgh"})
        result = responses(out)
        self.assertEqual(result[0]["type"], "error")
        self.assertNotIn("started", [r["type"] for r in result])


class TestCancellation(unittest.TestCase):
    def test_new_request_supersedes_old(self):
        hold = threading.Event()
        worker, _, players, out = make_worker(chunks=1, hold=hold)
        worker.handle({"id": 1, "type": "speak", "text": "one"})
        time.sleep(0.05)
        worker.handle({"id": 2, "type": "speak", "text": "two"})
        hold.set()
        time.sleep(0.4)
        seen = [(r["id"], r["type"]) for r in responses(out)]
        self.assertIn((1, "stopped"), seen)
        self.assertIn((2, "finished"), seen)
        self.assertFalse(players[0].overlap)

    def test_stop_during_synthesis(self):
        hold = threading.Event()
        worker, _, players, out = make_worker(hold=hold)
        worker.handle({"id": 1, "type": "speak", "text": "one"})
        time.sleep(0.05)
        worker.handle({"id": 2, "type": "stop"})
        hold.set()
        time.sleep(0.4)
        types = [(r["id"], r["type"]) for r in responses(out)]
        self.assertIn((2, "stopped"), types)
        self.assertNotIn("finished", [t for _, t in types])
        self.assertEqual(players[0].completed, 0)

    def test_stop_during_playback(self):
        worker, _, players, out = make_worker(chunks=200, delay=0.01)
        worker.handle({"id": 1, "type": "speak", "text": "one"})
        time.sleep(0.08)
        worker.handle({"id": 2, "type": "stop"})
        time.sleep(0.6)
        types = [r["type"] for r in responses(out)]
        self.assertIn("stopped", types)
        self.assertNotIn("finished", types)

    def test_fast_requests_never_overlap(self):
        worker, _, players, _ = make_worker(chunks=50, delay=0.005)
        for i in range(10):
            worker.handle({"id": i + 1, "type": "speak", "text": f"item {i}"})
            worker.handle({"id": 100 + i, "type": "stop"})
        time.sleep(1.2)
        self.assertLessEqual(players[0].max_active, 1)
        self.assertFalse(players[0].overlap)


class TestIsolation(unittest.TestCase):
    def test_no_network_is_used(self):
        original = socket.socket

        class Boom(original):  # type: ignore[misc, valid-type]
            def __init__(self, *args, **kwargs):
                raise AssertionError("network API used during speak cycle")

        socket.socket = Boom  # type: ignore[assignment]
        try:
            worker, _, _, out = make_worker()
            worker.handle({"id": 1, "type": "speak", "text": "hi"})
            wait_job(worker)
            self.assertIn("finished", [r["type"] for r in responses(out)])
        finally:
            socket.socket = original  # type: ignore[assignment]

    def test_no_temp_files_created(self):
        before = set(os.listdir("."))
        original_mkstemp = tempfile.mkstemp
        original_ntf = tempfile.NamedTemporaryFile

        def boom(*args, **kwargs):
            raise AssertionError("temporary file created")

        tempfile.mkstemp = boom  # type: ignore[assignment]
        tempfile.NamedTemporaryFile = boom  # type: ignore[assignment]
        try:
            worker, _, _, _ = make_worker()
            worker.handle({"id": 1, "type": "speak", "text": "hi"})
            wait_job(worker)
        finally:
            tempfile.mkstemp = original_mkstemp  # type: ignore[assignment]
            tempfile.NamedTemporaryFile = original_ntf  # type: ignore[assignment]
        after = set(os.listdir("."))
        self.assertEqual(before, after)


class TestRunLoop(unittest.TestCase):
    def test_ready_then_shutdown(self):
        inp = io.StringIO('{"id":1,"type":"shutdown"}\n')
        out = io.StringIO()
        run(inp, out, lambda: FakeSynth(), lambda: FakePlayer(), 2000)
        lines = [
            json.loads(line) for line in out.getvalue().splitlines() if line.strip()
        ]
        self.assertEqual(lines[0]["type"], "ready")
        self.assertEqual(lines[-1]["type"], "stopped")

    def test_bad_line_does_not_crash_loop(self):
        inp = io.StringIO('garbage\n{"id":2,"type":"shutdown"}\n')
        out = io.StringIO()
        run(inp, out, lambda: FakeSynth(), lambda: FakePlayer(), 2000)
        lines = [
            json.loads(line) for line in out.getvalue().splitlines() if line.strip()
        ]
        self.assertEqual(lines[0]["type"], "ready")
        self.assertEqual(lines[1]["type"], "error")
        self.assertEqual(lines[2]["type"], "stopped")


if __name__ == "__main__":
    unittest.main()

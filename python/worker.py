"""Local Piper TTS worker.

Speaks JSON lines on stdout and reads JSON lines from stdin. The main thread
only reads stdin, so `stop` and a superseding `speak` are handled immediately
even while another utterance is being synthesized or played.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import threading
from typing import Any, Callable, Dict, Optional

from audio import SoundDevicePlayer
from tts import PiperSynthesizer


class Job:
    def __init__(self, job_id: int) -> None:
        self.id = job_id
        self.cancel = threading.Event()
        self.superseded = False
        self.thread: Optional[threading.Thread] = None


def parse_request(line: str) -> Dict[str, Any]:
    """Parse one protocol line. Raises ValueError on malformed input."""
    try:
        value = json.loads(line)
    except json.JSONDecodeError as exc:
        raise ValueError(f"invalid JSON: {exc}") from exc
    if not isinstance(value, dict):
        raise ValueError("request must be a JSON object")
    return value


class Worker:
    def __init__(
        self,
        synthesizer_factory: Callable[[], Any],
        player_factory: Callable[[], Any],
        max_characters: int = 2000,
        out=None,
    ) -> None:
        self._synth_factory = synthesizer_factory
        self._player_factory = player_factory
        self._max_characters = max_characters
        self._out = out if out is not None else sys.stdout
        self._synth = None
        self._player = None
        self._lock = threading.Lock()
        self._active: Optional[Job] = None
        self._closed = False

    # -- protocol output -------------------------------------------------
    def emit(self, obj: Dict[str, Any]) -> None:
        self._out.write(json.dumps(obj, ensure_ascii=False) + "\n")
        self._out.flush()

    def _error(self, job_id: int, message: str) -> None:
        self.emit({"id": job_id, "type": "error", "message": message})

    # -- backends --------------------------------------------------------
    def _ensure_backends(self) -> Optional[str]:
        try:
            if self._synth is None:
                self._synth = self._synth_factory()
            if self._player is None:
                self._player = self._player_factory()
        except Exception as exc:  # noqa: BLE001 - surfaced to the user
            return str(exc)
        return None

    # -- request handling ------------------------------------------------
    def handle(self, request: Dict[str, Any]) -> Optional[str]:
        job_id = request.get("id", 0)
        if not isinstance(job_id, int):
            job_id = 0
        rtype = request.get("type")

        if rtype == "speak":
            text = request.get("text", "")
            if not isinstance(text, str):
                self._error(job_id, "text must be a string")
                return None
            try:
                length_scale = float(request.get("length_scale", 1.0))
            except (TypeError, ValueError):
                length_scale = 1.0
            self._speak(job_id, text, length_scale)
        elif rtype == "stop":
            self._stop(job_id)
        elif rtype == "health":
            self._health(job_id)
        elif rtype == "shutdown":
            self.emit({"id": job_id, "type": "stopped"})
            return "shutdown"
        else:
            self._error(job_id, f"unknown request type: {rtype!r}")
        return None

    def _speak(self, job_id: int, text: str, length_scale: float) -> None:
        if len(text) > self._max_characters:
            self._error(
                job_id,
                f"text too long ({len(text)} > {self._max_characters} characters)",
            )
            return

        with self._lock:
            previous = self._active
            if previous is not None:
                previous.superseded = True
                previous.cancel.set()
            job = Job(job_id)
            self._active = job

        error = self._ensure_backends()
        if error:
            self._error(job_id, error)
            return

        self.emit({"id": job_id, "type": "started"})
        thread = threading.Thread(
            target=self._run, args=(job, text, length_scale), daemon=True
        )
        job.thread = thread
        thread.start()

    def _run(self, job: Job, text: str, length_scale: float) -> None:
        completed = False
        try:
            chunks = self._synth.synthesize(text, length_scale, job.cancel)
            completed = self._player.play(chunks, job.cancel)
        except Exception as exc:  # noqa: BLE001 - surfaced to the user
            with self._lock:
                superseded = job.superseded
            if not superseded:
                self._error(job.id, str(exc))
            return

        with self._lock:
            superseded = job.superseded
            if self._active is job:
                self._active = None

        if job.cancel.is_set() or superseded:
            self.emit({"id": job.id, "type": "stopped"})
        elif completed:
            self.emit({"id": job.id, "type": "finished"})
        else:
            self.emit({"id": job.id, "type": "stopped"})

    def _stop(self, job_id: int) -> None:
        with self._lock:
            job = self._active
        if job is not None:
            job.cancel.set()
        if self._player is not None:
            try:
                self._player.stop()
            except Exception:
                pass
        self.emit({"id": job_id, "type": "stopped"})

    def _health(self, job_id: int) -> None:
        checks: Dict[str, Any] = {
            "platform": sys.platform,
            "max_characters": self._max_characters,
        }
        try:
            import piper  # type: ignore  # noqa: F401

            checks["piper_import"] = True
        except Exception as exc:  # noqa: BLE001
            checks["piper_import"] = False
            checks["piper_error"] = str(exc)
        try:
            import sounddevice  # type: ignore  # noqa: F401

            checks["sounddevice_import"] = True
        except Exception as exc:  # noqa: BLE001
            checks["sounddevice_import"] = False
            checks["sounddevice_error"] = str(exc)
        self.emit({"id": job_id, "type": "health", "checks": checks})

    def close(self) -> None:
        with self._lock:
            job = self._active
            self._closed = True
        if job is not None:
            job.cancel.set()
        if self._player is not None:
            try:
                self._player.stop()
                self._player.close()
            except Exception:
                pass
        if self._synth is not None:
            try:
                self._synth.close()
            except Exception:
                pass


def run(
    stdin,
    stdout,
    synthesizer_factory: Callable[[], Any],
    player_factory: Callable[[], Any],
    max_characters: int = 2000,
) -> None:
    worker = Worker(synthesizer_factory, player_factory, max_characters, out=stdout)
    worker.emit({"id": 0, "type": "ready"})
    for line in stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = parse_request(line)
        except ValueError as exc:
            worker.emit({"id": 0, "type": "error", "message": str(exc)})
            continue
        if worker.handle(request) == "shutdown":
            break
    worker.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="MD Voice Reader Piper worker")
    parser.add_argument("--model", required=True, help="Path to the Piper .onnx voice")
    parser.add_argument("--max-characters", type=int, default=2000)
    args = parser.parse_args(argv)

    for stream in (sys.stdin, sys.stdout):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
        except Exception:
            pass

    run(
        sys.stdin,
        sys.stdout,
        lambda: PiperSynthesizer(args.model),
        SoundDevicePlayer,
        args.max_characters,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())

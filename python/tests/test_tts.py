import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tts import PiperSynthesizer, SynthesisError  # noqa: E402


class TestPiperSynthesizer(unittest.TestCase):
    def test_missing_onnx_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = os.path.join(tmp, "voice.onnx")
            with self.assertRaises(SynthesisError) as ctx:
                PiperSynthesizer(missing)
            self.assertIn("not found", str(ctx.exception))

    def test_missing_json_config_is_a_clear_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            onnx = os.path.join(tmp, "voice.onnx")
            with open(onnx, "wb") as handle:
                handle.write(b"")
            with self.assertRaises(SynthesisError) as ctx:
                PiperSynthesizer(onnx)
            self.assertIn(".json", str(ctx.exception))

    def test_missing_piper_dependency_reports_install_hint(self):
        with tempfile.TemporaryDirectory() as tmp:
            onnx = os.path.join(tmp, "voice.onnx")
            with open(onnx, "wb") as handle:
                handle.write(b"")
            with open(onnx + ".json", "w", encoding="utf-8") as handle:
                handle.write("{}")
            try:
                import piper  # noqa: F401

                self.skipTest(
                    "piper is installed; cannot exercise the missing-dependency path"
                )
            except Exception:
                pass
            with self.assertRaises(SynthesisError) as ctx:
                PiperSynthesizer(onnx)
            self.assertIn("piper-tts", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

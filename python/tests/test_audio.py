import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import audio  # noqa: E402
from audio import AudioError, SoundDevicePlayer  # noqa: E402


class TestAudio(unittest.TestCase):
    def test_module_imports_without_sounddevice(self):
        # Importing the module must not require sounddevice to be installed.
        self.assertTrue(hasattr(audio, "SoundDevicePlayer"))

    def test_missing_sounddevice_is_a_clear_error(self):
        try:
            import sounddevice  # noqa: F401

            self.skipTest(
                "sounddevice is installed; cannot exercise the missing-dependency path"
            )
        except Exception:
            pass
        with self.assertRaises(AudioError) as ctx:
            SoundDevicePlayer()
        self.assertIn("sounddevice", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

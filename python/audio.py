"""Local audio playback with immediate interruption.

Uses sounddevice (PortAudio) because it plays int16 buffers from memory and can
be aborted mid-stream. No temporary files are created.
"""

from __future__ import annotations

import threading
from typing import Iterable, Protocol

from tts import AudioChunk


class AudioError(Exception):
    """Raised when the audio backend cannot start or fails."""


class Player(Protocol):
    def play(self, chunks: Iterable[AudioChunk], cancel: threading.Event) -> bool:
        """Play chunks. Return True if playback completed, False if cancelled."""

    def stop(self) -> None: ...

    def close(self) -> None: ...


class SoundDevicePlayer:
    def __init__(self) -> None:
        try:
            import sounddevice as sd  # type: ignore
        except Exception as exc:  # pragma: no cover - depends on environment
            raise AudioError(
                "Python package 'sounddevice' is not installed. "
                "Run: uv pip install sounddevice numpy"
            ) from exc
        self._sd = sd
        self._stream = None
        self._lock = threading.Lock()
        self._device = threading.Lock()

    def _open(self, sample_rate: int):
        return self._sd.OutputStream(
            samplerate=sample_rate, channels=1, dtype="int16", blocksize=0
        )

    def play(self, chunks: Iterable[AudioChunk], cancel: threading.Event) -> bool:
        import numpy as np  # type: ignore

        current_rate = None
        # Serialize device access: a superseded job releases this lock as soon as
        # its cancel flag is observed, so a new job never overlaps the old audio.
        with self._device:
            try:
                for chunk in chunks:
                    if cancel.is_set():
                        return False
                    if current_rate is None:
                        current_rate = chunk.sample_rate
                        with self._lock:
                            self._stream = self._open(current_rate)
                            self._stream.start()
                    samples = np.frombuffer(chunk.samples, dtype="int16")
                    with self._lock:
                        stream = self._stream
                    if stream is None:
                        return False
                    try:
                        stream.write(samples)
                    except Exception:
                        return False
                return not cancel.is_set()
            finally:
                self._close_stream()

    def _close_stream(self) -> None:
        with self._lock:
            stream = self._stream
            self._stream = None
        if stream is not None:
            try:
                stream.stop()
            except Exception:
                pass
            try:
                stream.close()
            except Exception:
                pass

    def stop(self) -> None:
        with self._lock:
            stream = self._stream
        if stream is not None:
            try:
                stream.abort()
            except Exception:
                pass

    def close(self) -> None:
        self._close_stream()

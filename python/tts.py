"""Piper synthesis adapter.

The Piper API has changed across releases, so this adapter is intentionally
tolerant: it introspects the installed package and falls back across known
call signatures. End-to-end synthesis is UNVERIFIED until run against a real
voice model (see docs/ACCEPTANCE.md).
"""

from __future__ import annotations

import inspect
import os
import threading
from dataclasses import dataclass
from typing import Iterator, Protocol


class SynthesisError(Exception):
    """Raised when synthesis cannot start or fails."""


@dataclass
class AudioChunk:
    samples: bytes  # int16 little-endian mono
    sample_rate: int


class Synthesizer(Protocol):
    def synthesize(
        self, text: str, length_scale: float, cancel: threading.Event
    ) -> Iterator[AudioChunk]: ...

    def close(self) -> None: ...


class PiperSynthesizer:
    def __init__(self, model_path: str) -> None:
        if not os.path.isfile(model_path):
            raise SynthesisError(f"Voice model not found: {model_path}")
        config_path = model_path + ".json"
        if not os.path.isfile(config_path):
            raise SynthesisError(f"Voice config not found: {config_path}")

        try:
            from piper import PiperVoice  # type: ignore
        except Exception as exc:  # pragma: no cover - depends on environment
            raise SynthesisError(
                "Python package 'piper-tts' is not installed. "
                "Run: uv pip install piper-tts"
            ) from exc

        self._model_path = model_path
        self._config_path = config_path
        try:
            self._voice = PiperVoice.load(model_path, config_path=config_path)
        except TypeError:
            self._voice = PiperVoice.load(model_path)
        except Exception as exc:  # pragma: no cover - depends on model
            raise SynthesisError(f"Failed to load voice: {exc}") from exc

    def _raw(self, text: str, length_scale: float):
        voice = self._voice
        try:
            from piper import SynthesisConfig  # type: ignore

            params = inspect.signature(SynthesisConfig).parameters
            kwargs = {}
            if "length_scale" in params:
                kwargs["length_scale"] = length_scale
            if "volume" in params:
                kwargs["volume"] = 1.0
            config = SynthesisConfig(**kwargs)
            return voice.synthesize(text, syn_config=config)
        except Exception:
            pass
        try:
            return voice.synthesize(text, length_scale=length_scale)
        except TypeError:
            return voice.synthesize(text)

    @staticmethod
    def _to_chunk(raw) -> AudioChunk:
        data = getattr(raw, "audio_int16_bytes", None)
        if data is None:
            array = getattr(raw, "audio_int16_array", None)
            if array is not None:
                data = array.tobytes()
        if data is None:
            data = bytes(raw)
        rate = int(getattr(raw, "sample_rate", 22050))
        return AudioChunk(data, rate)

    def synthesize(
        self, text: str, length_scale: float, cancel: threading.Event
    ) -> Iterator[AudioChunk]:
        for raw in self._raw(text, length_scale):
            if cancel.is_set():
                return
            yield self._to_chunk(raw)

    def close(self) -> None:
        self._voice = None

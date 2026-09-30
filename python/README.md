# Python worker setup (Windows)

The extension talks to `worker.py` over stdio. The worker needs a Windows Python
with Piper and an audio backend. A WSL Python will not work because it has no
audio device reachable from the Windows UI extension host.

## 1. Isolated interpreter (outside any project)

```powershell
uv venv D:\AI\md-voice-reader-venv
$py = "D:\AI\md-voice-reader-venv\Scripts\python.exe"
uv pip install --python $py piper-tts sounddevice numpy
```

## 2. A voice (once, while online)

Download an English voice from the Piper voices catalog. You need BOTH files and
they must sit next to each other:

- `en_US-lessac-medium.onnx`
- `en_US-lessac-medium.onnx.json`

Put them in `D:\AI\piper-voices\` and point `mdVoice.modelPath` at the `.onnx`.

The `.onnx.json` file must always accompany the `.onnx`; the worker validates
this and reports a clear error if it is missing.

## 3. Verify

```powershell
& $py -c "import piper, sounddevice, numpy; print('ok')"
```

Or run the extension command `MD Voice: Check Setup`.

## 4. Offline

After the voice is downloaded, disconnect the network. Synthesis and playback are
fully local.

## Licensing

- `piper1-gpl` is GPL-3.0. It is installed by you and is not bundled in the VSIX.
- Each voice has its own license. Check the license of the voice you download.

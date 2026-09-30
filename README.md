# MD Voice Reader

An offline, Windows-first VS Code extension that reads English Markdown text
aloud while you work. Select a word or sentence and hear it pronounced locally,
read the current paragraph, read slowly, replay, and stop. No cloud, no
telemetry, no network at runtime.

Implementation language: TypeScript extension + a local Python/Piper worker.

## Quick start (Windows PowerShell)

```powershell
# 1. Create an isolated interpreter outside any project (storage policy: D:\AI).
uv venv D:\AI\md-voice-reader-venv
$py = "D:\AI\md-voice-reader-venv\Scripts\python.exe"

# 2. Install Piper and the audio backend into that interpreter.
uv pip install --python $py piper-tts sounddevice numpy

# 3. Download one English voice (once, while online) into D:\AI\piper-voices\.
#    Example (medium quality en_US voice). Keep BOTH the .onnx and .onnx.json.
#    See python/README.md for the current download URLs.

# 4. Install extension dependencies and build.
npm install
npm run compile
```

Then in VS Code set (User settings):

- `mdVoice.pythonPath` = `D:\AI\md-voice-reader-venv\Scripts\python.exe`
- `mdVoice.modelPath`  = `D:\AI\piper-voices\en_US-lessac-medium.onnx`

Press `F5` to launch the Extension Development Host, or install the VSIX.

## Commands

| Command | Default keybinding | Purpose |
| --- | --- | --- |
| `MD Voice: Read Selection` | `Ctrl+Alt+R` | Read the selected text. |
| `MD Voice: Read Paragraph` | `Ctrl+Alt+P` | Read the paragraph at the cursor. |
| `MD Voice: Read Slowly` | `Ctrl+Alt+S` | Read selection, else paragraph, slower. |
| `MD Voice: Replay` | (none) | Repeat the last utterance. |
| `MD Voice: Stop` | `Ctrl+Alt+X` | Stop speech promptly. |
| `MD Voice: Check Setup` | (none) | Validate Python, Piper and model paths. |

Keybindings are active only in Markdown editors. Rebind them if they collide
with another extension on your machine.

## Settings

- `mdVoice.pythonPath` (machine scope): absolute path to a Windows Python with
  `piper-tts` and `sounddevice`.
- `mdVoice.modelPath` (machine scope): absolute path to the Piper voice `.onnx`.
- `mdVoice.normalLengthScale` (default 1.0).
- `mdVoice.slowLengthScale` (default 1.5).
- `mdVoice.maxCharacters` (default 2000).
- `mdVoice.readInlineCode` (default false).

`pythonPath` and `modelPath` use `machine` scope so a workspace cannot silently
swap the executable that runs on your machine.

## Testing and packaging

```powershell
npm run compile          # TypeScript typecheck + emit
npm test                 # Markdown + validation unit tests (mocha)
python -m unittest discover -s python/tests -v   # Worker/audio tests (stdlib)
npx @vscode/vsce package -o md-voice-reader.vsix # build the VSIX
```

## Offline operation

After step 3 above, disconnect the network. All speech synthesis and playback
happen through the local Python worker and the local voice files. The extension
makes no network calls.

## Licensing

- Extension source: MIT (see LICENSE).
- Piper (`piper1-gpl`) is GPL-3.0. It is invoked as a separate local process and
  is NOT bundled in the VSIX; the user installs it.
- Each Piper voice carries its own license. Verify the license of the specific
  voice you download. Voices are NOT redistributed here.

## Limitations

- English only in this version.
- No automatic read-while-scrolling, STT, translation, or language switching.
- Desktop VS Code only; `vscode.dev` is unsupported.
- Audio playback is not guaranteed on Linux/macOS.
- See docs/ACCEPTANCE.md for the manual audio checks that require a physical
  speaker and are labelled unverified until performed.

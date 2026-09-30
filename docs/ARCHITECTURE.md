# Architecture

## Components

1. VS Code UI extension (TypeScript)
   - Registers commands and settings.
   - Reads the current editor selection or enclosing Markdown block.
   - Parses and normalizes Markdown into speech text.
   - Manages a persistent local Python worker.
   - Reports errors without exposing document contents.

2. Local Python worker (persistent process)
   - Loads the configured Piper voice from local disk once per process.
   - Synthesizes requested text on a worker thread.
   - Streams audio to a Windows-compatible output device.
   - Interrupts active synthesis/playback on demand.
   - Uses no network.

3. Local voice files
   - Piper `.onnx` model and matching `.onnx.json`.
   - Stored outside the extension source tree and outside user projects.
   - The configured model path is absolute.

## Process and protocol decision

A single persistent Python worker avoids reloading the model on every word. The
protocol is JSON lines over stdio.

- Requests: `speak`, `stop`, `health`, `shutdown`.
- Responses: `ready`, `started`, `finished`, `stopped`, `error`, `health`.
- Every request and response carries an integer request ID. The initial `ready`
  uses id 0.
- stdout is protocol-only. Diagnostics go to stderr.
- Input size is bounded by `mdVoice.maxCharacters` on both sides.
- Text is passed only inside JSON on stdin, never on a command line, so no shell
  interpolation is possible.

## Concurrency model (critical)

The worker MUST keep its main thread free to read stdin at all times, otherwise
`stop` and a superseding `speak` queue behind the current utterance and appear
broken.

- Each `speak` allocates a `threading.Event` cancel flag and a job object.
- Synthesis and playback execute on a daemon thread.
- Before starting a new `speak`, the previous job's cancel flag is set and the
  job is marked superseded.
- The synthesizer checks the flag between chunks; the player checks the flag
  before each write and can be aborted immediately with `sounddevice`'s
  `stop()`/`abort()`.
- A superseded or cancelled job emits `stopped`; only the winning job emits
  `finished`. Late audio from a superseded request never reaches the speaker.
- `stop` is idempotent and always answers `stopped`.

## Audio backend

`sounddevice` (PortAudio) is used because it plays int16 buffers from memory and
supports immediate interruption. `winsound` is rejected (file-only, cannot be cut
mid-buffer). Audio is streamed chunk by chunk to an `OutputStream`, so
interruption latency is one chunk. No temporary WAV files are created.

## Encoding

The worker is spawned with `PYTHONUTF8=1` and `PYTHONIOENCODING=utf-8`, and it
reconfigures `sys.stdin`/`sys.stdout` to UTF-8. This prevents cp1252 corruption
or crashes when Unicode reaches the protocol.

## Concurrency guarantees

- A new `speak` supersedes the previous one.
- Late results for an old request never start playback.
- `stop` is idempotent.
- If the worker dies, a useful error is shown; the next command restarts it.
- Dispose sends `shutdown`, then terminates the process if it does not exit.

## Security and privacy

- Arguments are passed with process APIs, never a shell string.
- No network listener is opened.
- No file paths, text, or audio leave the machine.
- No temporary audio files are used.
- Audio and model data are never written into the open project.
- Workspace trust is checked before launching the configured Python; if the
  workspace is untrusted, the launch is refused with an explanation.
- Executable and model settings are machine-scoped so workspace-provided values
  cannot override them.

## VS Code environment

- Extension is `"extensionKind": ["ui"]`.
- Piper runs on the local Windows machine, not inside WSL/SSH/container.
- Active editor content is read through VS Code APIs, including unsaved changes.
- On VS Code for the Web, commands explain that desktop VS Code is required.
- There is no dependence on the workspace's package manager or Python env.

## Licensing

- The extension is MIT.
- Piper (`piper1-gpl`) is GPL-3.0 and is invoked as a separate process; it is not
  bundled in the VSIX.
- Voices carry individual licenses. No voice is redistributed in the VSIX.

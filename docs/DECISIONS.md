# Architectural decisions and spec corrections

This record captures the changes applied to the original specification. Code and
docs must stay consistent with these decisions.

## D1 - Worker keeps stdin free (threaded jobs)

The original spec required reliable Stop but did not define the worker's
concurrency model. A single-threaded `readline -> synth -> play` loop buffers
`stop` until the utterance ends, so Stop appears broken and a second `speak`
queues instead of superseding.

Decision: the main thread only reads stdin. Each `speak` runs on a daemon thread
with a per-request `threading.Event`. A new `speak` cancels the previous job;
`stop` cancels and aborts audio immediately. Superseded jobs emit `stopped` and
their late audio is discarded.

## D2 - Audio backend is sounddevice

`winsound` is file-only and cannot be cut mid-buffer; `simpleaudio` cannot either.
Decision: use `sounddevice` (PortAudio), which plays int16 buffers from memory and
supports immediate `stop()`/`abort()`. This also satisfies the "no temp WAV" goal.

## D3 - The Python interpreter must be Windows-native

A WSL Python has no audio device reachable from the Windows UI extension host.
Decision: `mdVoice.pythonPath` must point at a Windows `python.exe`. `Check Setup`
probes `sys.platform` and rejects a non-`win32` interpreter, and verifies `piper`
and `sounddevice` import and that model files exist.

## D4 - Explicit UTF-8 on the protocol

Windows Python defaults to cp1252. Decision: spawn with `PYTHONUTF8=1` and
`PYTHONIOENCODING=utf-8`, and reconfigure stdio in the worker. This prevents
corruption or crashes when Unicode crosses the protocol.

## D5 - Settings scope is the primary trust control

Workspace trust alone does not stop a workspace from swapping an executable.
Decision: declare `pythonPath` and `modelPath` with `scope: "machine"` so
workspaces cannot override them. Workspace trust is an additional check.

## D6 - Markdown parser instead of regex chains

Decision: use `markdown-it` (CommonJS-friendly and stable) with its source line
maps for paragraph detection, and an inline-token walker for extraction. Front
matter is pre-stripped (markdown-it does not skip YAML by default). This keeps
extraction deterministic and unit-testable.

## D7 - Image alt text is spoken

The original tests were ambiguous. Decision: speak the image alt text (the
accessible label) and drop the URL and path.

## D8 - Web detection without a browser entry point

`extensionKind: ["ui"]` with no `browser` field means the extension does not load
on `vscode.dev`. Decision: commands check `vscode.env.uiKind === UIKind.Web` and
explain that desktop VS Code is required.

## D9 - Piper is not bundled

Piper is GPL-3.0 and voices have individual licenses. Decision: the VSIX ships
neither Piper nor any voice; the user installs Piper into an isolated venv under
`D:\AI\` and downloads one voice. README documents attribution.

## D10 - Piper API is version-tolerant and unverified

The `piper1-gpl` API has renamed methods across releases. Decision: the adapter
introspects `SynthesisConfig` and the `synthesize` signature and falls back across
known variants. End-to-end synthesis is UNVERIFIED until run against a real model.

# Project: MD Voice Reader

You are implementing a complete, local-only VS Code extension for reading English
Markdown text aloud while the user works in any VS Code project.

Read all files in docs/ before writing code. Treat docs/ACCEPTANCE.md as the
definition of done. docs/DECISIONS.md records corrections applied to the original
specification and must stay consistent with the code.

## Non-negotiable requirements

- Windows 11 desktop is the primary supported platform.
- The extension runs in the local UI extension host: `"extensionKind": ["ui"]`.
- No cloud services, telemetry, HTTP calls, automatic model downloads, or
  internet access at runtime.
- The extension must work with Markdown files in any open workspace without
  adding files to that workspace.
- Use TypeScript for the VS Code extension and Python + Piper for local TTS.
- Read model files only from a configured absolute local path.
- Never execute text from the Markdown document as shell commands.
- Do not use `shell: true` with untrusted text.
- Do not log full document contents or user-selected text.
- Do not bundle a voice model into source control or the VSIX by default.
- No LLM, RAG, STT, browser UI, or external server.

## Implementation discipline

1. Inspect the installed VS Code API, Node.js, Python and Piper versions before
   relying on version-specific APIs.
2. Implement a small working vertical slice first: read selection -> hear audio.
3. Add paragraph selection, stop, replay, slower mode, robust process handling,
   tests, docs, then VSIX packaging.
4. Favor explicit types, small modules, and deterministic text processing.
5. Handle Unicode, Windows paths with spaces, empty selections, missing files,
   and interruption during playback.
6. Keep all generated runtime artifacts outside the user's open project.
7. Run automated tests and report the exact commands and results.
8. Do not claim end-to-end audio works unless manually verified; where manual
   verification is unavailable, state exactly what remains unverified.

## Concurrency contract (do not weaken)

The Python worker MUST keep its main thread free to read stdin at all times.
Synthesis and playback run on a separate thread guarded by a per-request
`threading.Event`. A new `speak` sets the cancel flag on the previous request
before starting, and `stop` sets the flag and calls `sd.stop()` immediately.
Late audio from a superseded request must never reach the speaker.

## Required final response

Report:
- Implemented files and main design decisions.
- Setup commands for Windows PowerShell.
- How to download and configure the Piper voice before going offline.
- How to launch and use the extension.
- Test/build/VSIX results.
- Known limitations and any unverified manual checks.

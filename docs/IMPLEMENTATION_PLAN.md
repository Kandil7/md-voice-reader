# Implementation plan

Follow these phases in order. Complete and test each phase before the next.

## Phase 1 - Scaffold

- package.json with manifest, commands, settings, keybindings, activation,
  `extensionKind: ["ui"]`.
- tsconfig.json, .vscode/launch.json, .vscode/tasks.json, .gitignore,
  .vscodeignore.
- Python requirements note and a README with first-time online setup and later
  offline operation.

## Phase 2 - Markdown text selection

Pure TypeScript module (`src/markdown.ts`) built on a maintained parser
(`markdown-it`) rather than chained regex:
- Extract selected text to speech.
- Locate the enclosing block at the cursor using parser line maps.
- Skip fenced code, front matter, thematic breaks, HTML.
- Speak link labels, image alt text; skip URLs.
- Collapse whitespace; return empty when no letters or digits remain.
- Unit tested with representative Markdown (see TEST_PLAN.md).

## Phase 3 - Local TTS worker

- `python/worker.py`: JSON-lines protocol, threaded job model, cancellation.
- `python/tts.py`: Piper adapter (lazy import, version-tolerant), plus a clear
  error when Piper or the model is missing.
- `python/audio.py`: `sounddevice` player with immediate stop; no temp files.
- stdlib `unittest` tests using fake synthesizer/player so no model or speaker is
  needed.

## Phase 4 - VS Code integration

- `src/extension.ts`, `src/worker.ts`, `src/validation.ts`.
- Commands, settings, worker lifecycle, error messages, trust check.
- Behaviour covered: no active editor, non-Markdown, empty selection, paragraph
  fallback, stop/replay state, invalid paths, untrusted workspace, web
  unsupported, superseding read.

## Phase 5 - Quality gates

- TypeScript compile/typecheck.
- TypeScript unit tests.
- Python tests.
- VSIX package step.
- VSIX content excludes sources, tests, venv, model, caches, maps.

Manual audio tests are documented but not marked passed unless actually run.

# Product specification

## Goal

Allow a developer to pronounce English words, phrases, and paragraphs in Markdown
files while working inside VS Code, fully offline after initial installation.

## Target workflow

1. User opens any project in desktop VS Code.
2. User opens a Markdown file.
3. User selects a word or sentence and invokes "MD Voice: Read Selection".
4. Audio starts locally without saving a WAV file into the workspace.
5. User can stop, replay, or read the current paragraph.
6. User may change speech speed using a setting or a "Read Slowly" command.

## MVP commands

- `mdVoice.readSelection`: Read selected text.
- `mdVoice.readParagraph`: Read paragraph at the cursor.
- `mdVoice.readSlowly`: Read selected text, otherwise current paragraph, slower.
- `mdVoice.replay`: Repeat the last successfully requested utterance.
- `mdVoice.stop`: Stop current speech promptly.
- `mdVoice.checkSetup`: Validate configured Python executable and Piper files.

All six are registered in the Command Palette. Default keybindings are provided
for the four high-frequency commands and are active only in Markdown editors.

## Settings

- `mdVoice.pythonPath`: absolute path to the Windows Python with piper-tts.
  Declared with `scope: "machine"`.
- `mdVoice.modelPath`: absolute path to the voice `.onnx` file.
  Declared with `scope: "machine"`.
- `mdVoice.normalLengthScale`: default 1.0.
- `mdVoice.slowLengthScale`: default 1.5.
- `mdVoice.maxCharacters`: default 2000; reject longer requests with a clear error.
- `mdVoice.readInlineCode`: default false.

Numeric ranges and paths are validated before the worker launches. Executable and
model paths are machine-scoped so a workspace cannot override them silently; the
trust implication is documented rather than hidden.

## Markdown behavior

- For explicit selection: interpret as Markdown text, strip syntax, keep
  human-readable link labels, skip link destinations and image URLs.
- For paragraph mode: determine the enclosing block from the active document with
  a real Markdown parser, using source line ranges; skip fenced code blocks,
  YAML front matter, and thematic separators.
- Image alt text is spoken (it is the human label); the image URL is not.
- Raw URLs in body text are not spoken.
- Preserve natural sentence punctuation.
- Do not read backticks, Markdown markers, raw URLs, or HTML tags.
- Inline code is skipped by default; the setting may enable reading it.
- If the resulting text has no letters or digits, show an informative message and
  do not call the worker.
- Handle CRLF and LF.
- Markdown text extraction is deterministic and unit tested separately.

## Unsupported in MVP

- Automatic reading while scrolling.
- Speech-to-text.
- Translation.
- Arabic/English language auto-switching.
- Electron Webviews or sidebars.
- Browser VS Code (`vscode.dev`).
- Linux/macOS audio playback guarantees.

## UX

- Commands operate on the active `.md` or `.markdown` text editor, including
  unsaved changes.
- Errors are actionable and concise.
- Stop works while synthesis or playback is in progress.
- Starting a new read replaces the previous utterance rather than overlapping.
- Replay replays the last cleaned text and the same speed.
- Editor focus is not stolen.

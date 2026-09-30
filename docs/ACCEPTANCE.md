# Definition of done

The project is complete only if:

- [ ] A VS Code extension project can be installed and launched.
- [ ] The VSIX can be built.
- [ ] The extension works on a Markdown file in any local project.
- [ ] Read Selection, Read Paragraph, Read Slowly, Replay, Stop and Check Setup
      are registered and operational.
- [ ] Runtime does not require internet.
- [ ] No automatic model download or network call occurs at runtime.
- [ ] Voice files are loaded from local disk.
- [ ] Markdown syntax, URLs, front matter and fenced code do not pollute speech.
- [ ] New speech cancels or replaces previous speech without overlap.
- [ ] Stop works promptly during playback.
- [ ] Paths with spaces and non-ASCII text do not break the worker.
- [ ] Missing setup produces useful instructions, not a stack trace.
- [ ] No files are written into the user's active project.
- [ ] Unit and integration tests have results reported accurately.
- [ ] README explains initial setup, offline use, keybindings, testing,
      packaging, licensing and limitations.

Do not mark manual speaker/audio checks as passed unless actually performed.

# Test plan

## Deterministic Markdown tests

Input -> expected spoken text:

1. `# Retrieval-Augmented Generation`
   -> `Retrieval-Augmented Generation`
2. `Use **hybrid search** for [ranking](https://example.com).`
   -> `Use hybrid search for ranking.`
3. ``Run `pip install x` before testing.``
   -> `Run before testing.` with inline code disabled.
4. A fenced Python block between two paragraphs
   -> only the prose paragraphs are spoken in paragraph mode.
5. `![Diagram](./images/a.png)`
   -> `Diagram` (alt text spoken; no URL, no path).
6. `---` and YAML front matter
   -> no speech.
7. Markdown with Unicode, CRLF and blank lines
   -> no crash and correct paragraph isolation.
8. A list item with nested links and emphasis
   -> visible labels only, in natural order.
9. A raw URL
   -> not read aloud.
10. Empty or punctuation-only selection
    -> empty result, no worker request.

## Worker tests (stdlib unittest, fakes)

- Model load occurs once per worker process.
- Missing `.onnx` and `.onnx.json` produce clear errors.
- Invalid JSON request produces an error response, not a worker crash.
- Oversized input is rejected.
- New request cancels the old request.
- Stop works during synthesis and during playback.
- Fast repeated `speak`/`stop` never overlap audio.
- No network APIs are invoked during a speak/stop cycle.
- No runtime files are created during a speak/stop cycle.

## Manual Windows 11 acceptance

- Install extension from local VSIX.
- Configure Python and Piper voice paths.
- Disconnect internet.
- Open one Markdown file in an unrelated project.
- Select `phonemization`; hear pronunciation.
- Select a sentence with a Markdown link; hear the label, not the URL.
- Invoke Read Paragraph on a prose paragraph.
- Invoke Read Slowly and confirm a noticeable speed difference.
- Stop mid-playback and confirm prompt silence.
- Start another read immediately; no overlapping audio.
- Try a missing model; receive an actionable error.
- Open a WSL project from local VS Code; speech still plays locally.
- Confirm no added files inside the target project.

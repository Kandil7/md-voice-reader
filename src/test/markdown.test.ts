import * as assert from "assert";
import {
  frontMatterLength,
  markdownToSpeech,
  paragraphToSpeech,
  stripFrontMatter
} from "../markdown";

const OFF = { readInlineCode: false };
const ON = { readInlineCode: true };

describe("markdownToSpeech", () => {
  it("reads a heading without the marker", () => {
    assert.strictEqual(
      markdownToSpeech("# Retrieval-Augmented Generation", OFF),
      "Retrieval-Augmented Generation"
    );
  });

  it("keeps link labels and drops destinations", () => {
    assert.strictEqual(
      markdownToSpeech("Use **hybrid search** for [ranking](https://example.com).", OFF),
      "Use hybrid search for ranking."
    );
  });

  it("skips inline code by default", () => {
    assert.strictEqual(
      markdownToSpeech("Run `pip install x` before testing.", OFF),
      "Run before testing."
    );
  });

  it("reads inline code when enabled", () => {
    assert.strictEqual(
      markdownToSpeech("Run `pip install x` before testing.", ON),
      "Run pip install x before testing."
    );
  });

  it("speaks image alt text but not the path", () => {
    assert.strictEqual(markdownToSpeech("![Diagram](./images/a.png)", OFF), "Diagram");
  });

  it("skips thematic breaks and front matter", () => {
    assert.strictEqual(markdownToSpeech("---", OFF), "");
    assert.strictEqual(markdownToSpeech("---\ntitle: x\n---\nHello world.", OFF), "Hello world.");
  });

  it("does not speak raw urls", () => {
    assert.strictEqual(markdownToSpeech("See https://example.com/raw now.", OFF), "See now.");
  });

  it("returns empty for punctuation only", () => {
    assert.strictEqual(markdownToSpeech("...", OFF), "");
    assert.strictEqual(markdownToSpeech("   \n  ", OFF), "");
  });

  it("reads a list item with nested links and emphasis", () => {
    assert.strictEqual(
      markdownToSpeech("- Use **hybrid** [search](http://x) here", OFF),
      "Use hybrid search here"
    );
  });
});

describe("front matter helpers", () => {
  it("measures and strips leading front matter", () => {
    const doc = "---\ntitle: x\n---\nBody";
    assert.ok(frontMatterLength(doc) > 0);
    assert.strictEqual(stripFrontMatter(doc), "Body");
    assert.strictEqual(frontMatterLength("Body only"), 0);
  });
});

describe("paragraphToSpeech", () => {
  const doc =
    'First paragraph here.\n\n```python\nprint("no")\n```\n\nSecond paragraph here.\n';

  it("reads the paragraph under the cursor", () => {
    assert.strictEqual(paragraphToSpeech(doc, doc.indexOf("First"), OFF), "First paragraph here.");
    assert.strictEqual(paragraphToSpeech(doc, doc.indexOf("Second"), OFF), "Second paragraph here.");
  });

  it("skips a fenced code block", () => {
    assert.strictEqual(paragraphToSpeech(doc, doc.indexOf("print"), OFF), "");
  });

  it("returns empty inside front matter", () => {
    const fm = "---\ntitle: x\n---\nBody text.";
    assert.strictEqual(paragraphToSpeech(fm, fm.indexOf("title"), OFF), "");
  });

  it("handles CRLF and unicode", () => {
    const crlf = "خط عربي\r\n\r\nHello world.\r\n";
    assert.strictEqual(paragraphToSpeech(crlf, crlf.indexOf("Hello"), OFF), "Hello world.");
  });

  it("returns empty on a blank line between blocks", () => {
    assert.strictEqual(paragraphToSpeech("One.\n\nTwo.", 5, OFF), "");
  });
});

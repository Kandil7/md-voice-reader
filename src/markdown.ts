import MarkdownIt from "markdown-it";

export interface SpeakOptions {
  readInlineCode: boolean;
}

const md = new MarkdownIt({ html: true, linkify: false, typographer: false });

const RAW_URL = /\bhttps?:\/\/[^\s<>()]+/gi;
const FRONT_MATTER = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/;
const HAS_SPEAKABLE = /[\p{L}\p{N}]/u;

/** Length in characters of a leading YAML front matter block, or 0. */
export function frontMatterLength(text: string): number {
  const m = FRONT_MATTER.exec(text);
  return m ? m[0].length : 0;
}

export function stripFrontMatter(text: string): string {
  const len = frontMatterLength(text);
  return len === 0 ? text : text.slice(len);
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function stripUrls(s: string): string {
  return s.replace(RAW_URL, " ");
}

function normalize(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/([,.;:!?])(?=\S)/g, "$1 ")
    .trim();
}

/**
 * Convert Markdown source to speakable text.
 * Deterministic: same input always yields the same output.
 */
export function markdownToSpeech(source: string, opts: SpeakOptions): string {
  const clean = stripFrontMatter(source);
  const tokens = md.parse(clean, {});
  const parts: string[] = [];

  for (const token of tokens) {
    if (token.type !== "inline") {
      continue;
    }
    for (const child of token.children ?? []) {
      switch (child.type) {
        case "text":
          parts.push(stripUrls(child.content));
          break;
        case "code_inline":
          if (opts.readInlineCode) {
            parts.push(child.content);
          }
          break;
        case "image":
          if (child.content) {
            parts.push(child.content);
          }
          break;
        case "softbreak":
        case "hardbreak":
          parts.push(" ");
          break;
        default:
          // link_open/close, strong/em open/close contribute no text of their own;
          // html_inline is intentionally dropped.
          break;
      }
    }
  }

  const text = normalize(decodeEntities(parts.join(" ")));
  return HAS_SPEAKABLE.test(text) ? text : "";
}

export function selectionToSpeech(selected: string, opts: SpeakOptions): string {
  return markdownToSpeech(selected, opts);
}

function lineAt(text: string, offset: number): number {
  const clamped = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  for (let i = 0; i < clamped; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
    }
  }
  return line;
}

/**
 * Return speakable text for the top-level Markdown block containing `offset`.
 * Returns "" when the cursor is in front matter, a code block, a thematic
 * break, or on a blank line between blocks.
 */
export function paragraphToSpeech(source: string, offset: number, opts: SpeakOptions): string {
  if (offset < frontMatterLength(source)) {
    return "";
  }
  const line = lineAt(source, offset);
  const tokens = md.parse(source, {});

  let block: [number, number] | undefined;
  for (const token of tokens) {
    if (token.level !== 0 || !token.map) {
      continue;
    }
    const [start, end] = token.map;
    if (line >= start && line < end) {
      block = [start, end];
      break;
    }
  }
  if (!block) {
    return "";
  }

  const lines = source.split(/\r?\n/);
  const raw = lines.slice(block[0], block[1]).join("\n");
  return markdownToSpeech(raw, opts);
}

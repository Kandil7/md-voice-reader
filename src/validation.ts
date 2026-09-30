export interface RawConfig {
  pythonPath?: unknown;
  modelPath?: unknown;
  normalLengthScale?: unknown;
  slowLengthScale?: unknown;
  maxCharacters?: unknown;
  readInlineCode?: unknown;
}

export interface Config {
  pythonPath: string;
  modelPath: string;
  normalLengthScale: number;
  slowLengthScale: number;
  maxCharacters: number;
  readInlineCode: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function asString(value: unknown, name: string): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string") {
    throw new ConfigError(`"${name}" must be a string.`);
  }
  return value.trim();
}

function asNumber(value: unknown, fallback: number, name: string, min: number, max: number): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) {
    throw new ConfigError(`"${name}" must be a number.`);
  }
  if (n < min || n > max) {
    throw new ConfigError(`"${name}" must be between ${min} and ${max} (got ${n}).`);
  }
  return n;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) {
    return fallback;
  }
  return Boolean(value);
}

export function isAbsolutePath(p: string): boolean {
  if (!p) {
    return false;
  }
  return /^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\") || p.startsWith("/");
}

export function validateConfig(raw: RawConfig): Config {
  return {
    pythonPath: asString(raw.pythonPath, "mdVoice.pythonPath"),
    modelPath: asString(raw.modelPath, "mdVoice.modelPath"),
    normalLengthScale: asNumber(raw.normalLengthScale, 1.0, "mdVoice.normalLengthScale", 0.1, 5),
    slowLengthScale: asNumber(raw.slowLengthScale, 1.5, "mdVoice.slowLengthScale", 0.1, 5),
    maxCharacters: Math.floor(asNumber(raw.maxCharacters, 2000, "mdVoice.maxCharacters", 1, 100000)),
    readInlineCode: asBoolean(raw.readInlineCode, false)
  };
}

export function requireSetup(config: Config): void {
  if (!config.pythonPath) {
    throw new ConfigError('Set "mdVoice.pythonPath" to a Windows Python interpreter with piper-tts and sounddevice.');
  }
  if (!config.modelPath) {
    throw new ConfigError('Set "mdVoice.modelPath" to a Piper .onnx voice file.');
  }
  if (!isAbsolutePath(config.pythonPath)) {
    throw new ConfigError('"mdVoice.pythonPath" must be an absolute path.');
  }
  if (!isAbsolutePath(config.modelPath)) {
    throw new ConfigError('"mdVoice.modelPath" must be an absolute path.');
  }
}

export function assertWithinLimit(text: string, maxCharacters: number): void {
  if (text.length > maxCharacters) {
    throw new ConfigError(
      `Text is ${text.length} characters, over the limit of ${maxCharacters}. Raise "mdVoice.maxCharacters" or shorten the selection.`
    );
  }
}

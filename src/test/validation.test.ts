import * as assert from "assert";
import {
  ConfigError,
  assertWithinLimit,
  isAbsolutePath,
  requireSetup,
  validateConfig
} from "../validation";

describe("validateConfig", () => {
  it("applies defaults", () => {
    const config = validateConfig({});
    assert.strictEqual(config.normalLengthScale, 1.0);
    assert.strictEqual(config.slowLengthScale, 1.5);
    assert.strictEqual(config.maxCharacters, 2000);
    assert.strictEqual(config.readInlineCode, false);
  });

  it("rejects out-of-range numbers", () => {
    assert.throws(() => validateConfig({ normalLengthScale: 99 }), ConfigError);
    assert.throws(() => validateConfig({ maxCharacters: 0 }), ConfigError);
    assert.throws(() => validateConfig({ normalLengthScale: "abc" }), ConfigError);
  });

  it("rejects non-string paths", () => {
    assert.throws(() => validateConfig({ pythonPath: 42 }), ConfigError);
  });
});

describe("isAbsolutePath", () => {
  it("recognises windows and posix absolute paths", () => {
    assert.ok(isAbsolutePath("C:\\Python\\python.exe"));
    assert.ok(isAbsolutePath("D:/AI/voices/en_US.onnx"));
    assert.ok(isAbsolutePath("\\\\server\\share\\python.exe"));
    assert.ok(!isAbsolutePath("python.exe"));
    assert.ok(!isAbsolutePath(""));
  });
});

describe("requireSetup", () => {
  it("requires absolute python and model paths", () => {
    assert.throws(() => requireSetup(validateConfig({})), ConfigError);
    assert.throws(
      () => requireSetup(validateConfig({ pythonPath: "python.exe", modelPath: "C:\\v.onnx" })),
      ConfigError
    );
    assert.doesNotThrow(() =>
      requireSetup(
        validateConfig({ pythonPath: "C:\\py\\python.exe", modelPath: "C:\\v\\en.onnx" })
      )
    );
  });
});

describe("assertWithinLimit", () => {
  it("throws above the limit and passes at or below", () => {
    assert.doesNotThrow(() => assertWithinLimit("abc", 3));
    assert.throws(() => assertWithinLimit("abcd", 3), ConfigError);
  });
});

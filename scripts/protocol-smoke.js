// End-to-end stdio smoke test for the compiled WorkerManager against the real
// python/worker.py. It does NOT need piper, sounddevice, a voice, or a speaker:
// it verifies spawn, UTF-8 JSON-lines handshake, health reporting, error
// propagation for a missing model, and clean disposal.
//
// Usage: node scripts/protocol-smoke.js
// Override the interpreter with MDV_PYTHON if python.exe is not at the default.

const path = require("path");
const { WorkerManager } = require(path.join(__dirname, "..", "out", "worker.js"));

const pythonPath =
  process.env.MDV_PYTHON ||
  "C:\\Users\\Kandil\\AppData\\Local\\Programs\\Python\\Python312\\python.exe";
const workerScript = path.join(__dirname, "..", "python", "worker.py");
const modelPath = path.join(__dirname, "..", "does-not-exist.onnx");

(async () => {
  const logs = [];
  const manager = new WorkerManager({
    pythonPath,
    workerScript,
    modelPath,
    maxCharacters: 2000,
    onLog: (message) => logs.push(message)
  });

  try {
    await manager.start();
    console.log("READY: worker handshake complete");

    const health = await manager.health();
    console.log("HEALTH:", JSON.stringify(health.checks));

    let threw = false;
    try {
      await manager.speak("hello world", 1.0);
    } catch (err) {
      threw = true;
      console.log("EXPECTED ERROR:", err.message);
    }
    if (!threw) {
      console.log("UNEXPECTED: speak did not fail for a missing model");
      process.exitCode = 1;
    }
  } catch (err) {
    console.log("FAILED:", err.message);
    process.exitCode = 1;
  } finally {
    await manager.dispose();
    console.log("DISPOSED: worker terminated cleanly");
  }
})();

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { spawn } from "child_process";
import { markdownToSpeech, paragraphToSpeech } from "./markdown";
import {
  Config,
  ConfigError,
  assertWithinLimit,
  requireSetup,
  validateConfig
} from "./validation";
import { WorkerManager } from "./worker";

let output: vscode.OutputChannel;
let worker: WorkerManager | undefined;
let lastUtterance: { text: string; lengthScale: number } | undefined;

class UserError extends Error {}

function readConfig(): Config {
  const cfg = vscode.workspace.getConfiguration("mdVoice");
  return validateConfig({
    pythonPath: cfg.get("pythonPath"),
    modelPath: cfg.get("modelPath"),
    normalLengthScale: cfg.get("normalLengthScale"),
    slowLengthScale: cfg.get("slowLengthScale"),
    maxCharacters: cfg.get("maxCharacters"),
    readInlineCode: cfg.get("readInlineCode")
  });
}

function isMarkdown(document: vscode.TextDocument): boolean {
  if (document.languageId === "markdown") {
    return true;
  }
  const name = document.fileName.toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown");
}

function ensureDesktop(): void {
  if (vscode.env.uiKind === vscode.UIKind.Web) {
    throw new UserError("MD Voice Reader needs desktop VS Code; the web version has no local Python.");
  }
}

function ensureTrusted(): void {
  if (!vscode.workspace.isTrusted) {
    throw new UserError(
      "This workspace is untrusted, so the local speech worker will not be launched. Trust the workspace to use MD Voice Reader."
    );
  }
}

function ensureFiles(config: Config): void {
  if (!fs.existsSync(config.pythonPath)) {
    throw new UserError(`Python interpreter not found: ${config.pythonPath}`);
  }
  if (!fs.existsSync(config.modelPath)) {
    throw new UserError(`Voice model not found: ${config.modelPath}`);
  }
  if (!fs.existsSync(config.modelPath + ".json")) {
    throw new UserError(`Voice config not found: ${config.modelPath}.json (it must sit beside the .onnx file).`);
  }
}

async function getWorker(config: Config): Promise<WorkerManager> {
  if (!worker) {
    worker = new WorkerManager({
      pythonPath: config.pythonPath,
      workerScript: path.join(__dirname, "..", "python", "worker.py"),
      modelPath: config.modelPath,
      maxCharacters: config.maxCharacters,
      onLog: (message) => output.appendLine(message)
    });
  }
  return worker;
}

function resolveSpeech(mode: "selection" | "paragraph" | "auto", config: Config): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    throw new UserError("Open a Markdown file and try again.");
  }
  if (!isMarkdown(editor.document)) {
    throw new UserError("The active editor is not a Markdown file.");
  }
  const document = editor.document;
  const opts = { readInlineCode: config.readInlineCode };
  const hasSelection = !editor.selection.isEmpty;

  if (mode !== "paragraph" && hasSelection) {
    const speech = markdownToSpeech(document.getText(editor.selection), opts);
    if (speech) {
      return speech;
    }
    if (mode === "selection") {
      throw new UserError("The selection has no readable text.");
    }
  }
  if (mode === "selection" && !hasSelection) {
    throw new UserError("Select some text first, or use Read Paragraph.");
  }

  const offset = document.offsetAt(editor.selection.active);
  const speech = paragraphToSpeech(document.getText(), offset, opts);
  if (!speech) {
    throw new UserError("No readable paragraph at the cursor.");
  }
  return speech;
}

async function speakText(text: string, lengthScale: number, config: Config): Promise<void> {
  assertWithinLimit(text, config.maxCharacters);
  const manager = await getWorker(config);
  await manager.speak(text, lengthScale);
  lastUtterance = { text, lengthScale };
  output.appendLine(`speaking ${text.length} chars at length scale ${lengthScale}`);
}

function run(fn: () => Promise<void>): () => Promise<void> {
  return async () => {
    try {
      await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      output.appendLine(`error: ${message}`);
      void vscode.window.showErrorMessage(`MD Voice: ${message}`);
    }
  };
}

interface ProbeResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function probe(pythonPath: string): Promise<ProbeResult> {
  return new Promise<ProbeResult>((resolve) => {
    const code = "import sys, platform; print(sys.platform); print(platform.python_version())";
    let child;
    try {
      child = spawn(pythonPath, ["-c", code], { windowsHide: true, shell: false });
    } catch (err) {
      resolve({ code: null, stdout: "", stderr: err instanceof Error ? err.message : String(err) });
      return;
    }
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => (stdout += data.toString()));
    child.stderr?.on("data", (data) => (stderr += data.toString()));
    child.on("error", (err) => resolve({ code: null, stdout, stderr: stderr + err.message }));
    child.on("close", (c) => resolve({ code: c, stdout, stderr }));
  });
}

async function checkSetup(): Promise<void> {
  output.show(true);
  output.appendLine("=== MD Voice Reader setup check ===");

  let config: Config;
  try {
    config = readConfig();
  } catch (err) {
    report(err);
    return;
  }
  ensureDesktop();

  if (!config.pythonPath) {
    report(new ConfigError('"mdVoice.pythonPath" is not set.'));
    return;
  }
  if (!config.modelPath) {
    report(new ConfigError('"mdVoice.modelPath" is not set.'));
    return;
  }

  const result = await probe(config.pythonPath);
  output.appendLine(`python: ${config.pythonPath}`);
  output.appendLine(`  probe exit: ${result.code}`);
  output.appendLine(`  probe stdout: ${result.stdout.trim()}`);
  if (result.stderr.trim()) {
    output.appendLine(`  probe stderr: ${result.stderr.trim()}`);
  }

  const onnxOk = fs.existsSync(config.modelPath);
  const jsonOk = fs.existsSync(config.modelPath + ".json");
  output.appendLine(`model: ${config.modelPath}`);
  output.appendLine(`  .onnx exists: ${onnxOk}`);
  output.appendLine(`  .onnx.json exists: ${jsonOk}`);

  if (vscode.workspace.isTrusted && onnxOk) {
    try {
      const manager = await getWorker(config);
      const health = await manager.health();
      output.appendLine(`worker health: ${JSON.stringify(health.checks ?? {})}`);
    } catch (err) {
      output.appendLine(`worker health failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  } else if (!vscode.workspace.isTrusted) {
    output.appendLine("workspace untrusted: skipping worker health check");
  }

  const problems: string[] = [];
  if (result.code === null) {
    problems.push("Python could not be started.");
  } else if (!result.stdout.includes("win32")) {
    problems.push("Python is not a Windows interpreter (a WSL Python has no audio device).");
  }
  if (!onnxOk) {
    problems.push("Voice .onnx not found.");
  }
  if (!jsonOk) {
    problems.push("Voice .onnx.json not found.");
  }

  if (problems.length) {
    void vscode.window.showWarningMessage(`MD Voice setup: ${problems.join(" ")}`);
  } else {
    void vscode.window.showInformationMessage("MD Voice setup looks complete. See the Output panel for details.");
  }
}

function report(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  output.appendLine(`error: ${message}`);
  void vscode.window.showErrorMessage(`MD Voice: ${message}`);
}

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel("MD Voice Reader");
  context.subscriptions.push(output);

  const prepared = (): Config => {
    const config = readConfig();
    ensureDesktop();
    ensureTrusted();
    requireSetup(config);
    ensureFiles(config);
    return config;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "mdVoice.readSelection",
      run(async () => {
        const config = prepared();
        await speakText(resolveSpeech("selection", config), config.normalLengthScale, config);
      })
    ),
    vscode.commands.registerCommand(
      "mdVoice.readParagraph",
      run(async () => {
        const config = prepared();
        await speakText(resolveSpeech("paragraph", config), config.normalLengthScale, config);
      })
    ),
    vscode.commands.registerCommand(
      "mdVoice.readSlowly",
      run(async () => {
        const config = prepared();
        await speakText(resolveSpeech("auto", config), config.slowLengthScale, config);
      })
    ),
    vscode.commands.registerCommand(
      "mdVoice.replay",
      run(async () => {
        const config = prepared();
        if (!lastUtterance) {
          throw new UserError("Nothing to replay yet.");
        }
        await speakText(lastUtterance.text, lastUtterance.lengthScale, config);
      })
    ),
    vscode.commands.registerCommand(
      "mdVoice.stop",
      run(async () => {
        if (worker && worker.isRunning()) {
          await worker.stop();
          output.appendLine("stop requested");
        }
      })
    ),
    vscode.commands.registerCommand(
      "mdVoice.checkSetup",
      run(async () => {
        await checkSetup();
      })
    )
  );
}

export function deactivate(): Thenable<void> | undefined {
  return worker?.dispose();
}

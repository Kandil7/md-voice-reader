import { ChildProcess, spawn } from "child_process";
import * as readline from "readline";
import { WorkerRequest, WorkerResponse } from "./types";

export interface WorkerOptions {
  pythonPath: string;
  workerScript: string;
  modelPath: string;
  maxCharacters: number;
  onLog: (message: string) => void;
}

export class WorkerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkerError";
  }
}

interface Pending {
  resolve: (response: WorkerResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WorkerManager {
  private child?: ChildProcess;
  private rl?: readline.Interface;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readyResolve?: () => void;
  private readyReject?: (error: Error) => void;
  private disposed = false;

  constructor(private readonly opts: WorkerOptions) {}

  isRunning(): boolean {
    return !!this.child && this.child.exitCode === null && !this.child.killed;
  }

  async start(): Promise<void> {
    if (this.disposed) {
      throw new WorkerError("The speech worker has been disposed.");
    }
    if (this.isRunning()) {
      return;
    }

    const args = [
      this.opts.workerScript,
      "--model",
      this.opts.modelPath,
      "--max-characters",
      String(this.opts.maxCharacters)
    ];
    const child = spawn(this.opts.pythonPath, args, {
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        PYTHONUNBUFFERED: "1"
      }
    });
    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new WorkerError("Failed to open pipes to the Python worker.");
    }
    this.child = child;

    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    this.rl = readline.createInterface({ input: child.stdout });
    this.rl.on("line", (line) => this.onLine(line));
    child.stderr.on("data", (data: string) => {
      const text = data.trimEnd();
      if (text) {
        this.opts.onLog(text);
      }
    });
    child.on("error", (err) => {
      this.failAll(new WorkerError(`Failed to start Python worker: ${err.message}`));
    });
    child.on("exit", (code, signal) => {
      this.opts.onLog(`worker exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
      this.child = undefined;
      this.rl?.close();
      this.rl = undefined;
      this.failAll(new WorkerError("Speech worker exited unexpectedly."));
    });

    await this.waitForReady(15000);
  }

  private waitForReady(timeoutMs: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.readyResolve = undefined;
        this.readyReject = undefined;
        reject(new WorkerError("Speech worker did not become ready in time."));
      }, timeoutMs);
      this.readyResolve = () => {
        clearTimeout(timer);
        this.readyResolve = undefined;
        this.readyReject = undefined;
        resolve();
      };
      this.readyReject = (error: Error) => {
        clearTimeout(timer);
        this.readyResolve = undefined;
        this.readyReject = undefined;
        reject(error);
      };
    });
  }

  private onLine(line: string): void {
    let response: WorkerResponse;
    try {
      response = JSON.parse(line) as WorkerResponse;
    } catch {
      this.opts.onLog(`ignoring non-protocol line: ${line}`);
      return;
    }
    if (response.type === "ready") {
      this.readyResolve?.();
      return;
    }
    const pending = this.pending.get(response.id);
    if (pending) {
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      pending.resolve(response);
    } else {
      this.opts.onLog(`late response id=${response.id} type=${response.type}`);
    }
  }

  private send(request: WorkerRequest, timeoutMs: number): Promise<WorkerResponse> {
    return new Promise<WorkerResponse>((resolve, reject) => {
      const child = this.child;
      if (!child || !child.stdin || !this.isRunning()) {
        reject(new WorkerError("Speech worker is not running."));
        return;
      }
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new WorkerError("Speech worker did not respond in time."));
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      try {
        child.stdin.write(JSON.stringify(request) + "\n");
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(request.id);
        reject(new WorkerError(`Failed to send request: ${err instanceof Error ? err.message : String(err)}`));
      }
    });
  }

  private failAll(error: Error): void {
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    this.readyReject?.(error);
  }

  async speak(text: string, lengthScale: number): Promise<void> {
    if (!this.isRunning()) {
      await this.start();
    }
    const id = this.nextId++;
    const response = await this.send({ id, type: "speak", text, length_scale: lengthScale }, 30000);
    if (response.type === "error") {
      throw new WorkerError(response.message ?? "Speech failed.");
    }
  }

  async stop(): Promise<void> {
    if (!this.isRunning()) {
      return;
    }
    const id = this.nextId++;
    try {
      await this.send({ id, type: "stop" }, 5000);
    } catch {
      // Stop is best effort; the worker may already be gone.
    }
  }

  async health(): Promise<WorkerResponse> {
    if (!this.isRunning()) {
      await this.start();
    }
    const id = this.nextId++;
    return this.send({ id, type: "health" }, 15000);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const child = this.child;
    if (!child || !this.isRunning()) {
      return;
    }
    try {
      if (child.stdin) {
        child.stdin.write(JSON.stringify({ id: this.nextId++, type: "shutdown" }) + "\n");
      }
    } catch {
      // ignore
    }
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore
        }
        resolve();
      }, 800);
      child.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    this.failAll(new WorkerError("The speech worker has been disposed."));
  }
}

import * as fs from "fs";
import * as net from "net";
import * as path from "path";
import { writeNativeFrame, NativeFrameReader } from "./native-framing";

export const REQUEST_TIMEOUT_MS = 30_000;

export interface BridgeOptions {
  socketPath: string;
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  timeoutMs?: number;
}

interface PendingRequest {
  socket: net.Socket;
  timer: NodeJS.Timeout;
}

export class Bridge {
  private readonly server = net.createServer();
  private readonly pending = new Map<string, PendingRequest>();
  private readonly reader: NativeFrameReader;
  private readonly timeoutMs: number;

  constructor(private readonly opts: BridgeOptions) {
    this.timeoutMs = opts.timeoutMs ?? REQUEST_TIMEOUT_MS;
    this.reader = new NativeFrameReader((msg) => this.handleExtensionFrame(msg));
  }

  async start(): Promise<void> {
    await this.unlinkStale(this.opts.socketPath);
    await this.ensureParentDir(this.opts.socketPath);

    this.server.on("connection", (socket) => this.handleCliConnection(socket));

    await new Promise<void>((resolve, reject) => {
      this.server.once("error", reject);
      this.server.listen(this.opts.socketPath, () => {
        this.server.off("error", reject);
        resolve();
      });
    });

    fs.chmodSync(this.opts.socketPath, 0o600);

    this.opts.stdin.on("data", (chunk: Buffer) => this.reader.push(chunk));
    this.opts.stdin.on("end", () => this.shutdown());
  }

  async stop(): Promise<void> {
    await this.shutdown();
  }

  private async handleCliConnection(socket: net.Socket): Promise<void> {
    let buf = "";

    socket.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      const newlineIdx = buf.indexOf("\n");
      const rawRequest = newlineIdx >= 0 ? buf.slice(0, newlineIdx) : null;
      if (rawRequest === null) {
        return;
      }
      buf = buf.slice(newlineIdx + 1);
      this.forwardRequest(socket, rawRequest);
    });

    socket.on("end", () => {
      // If client disconnected without sending a newline, try the buffered content.
      if (buf.trim().length > 0) {
        this.forwardRequest(socket, buf.trim());
        buf = "";
      }
    });

    socket.on("error", () => {
      // swallow — socket closure is handled elsewhere.
    });
  }

  private forwardRequest(socket: net.Socket, raw: string): void {
    let parsed: { correlationId?: string };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      this.writeSocket(socket, { correlationId: "", error: `invalid JSON: ${(err as Error).message}` });
      socket.end();
      return;
    }

    const correlationId = parsed.correlationId;
    if (!correlationId || typeof correlationId !== "string") {
      this.writeSocket(socket, { correlationId: "", error: "missing correlationId" });
      socket.end();
      return;
    }

    if (this.pending.has(correlationId)) {
      this.writeSocket(socket, { correlationId, error: "duplicate correlationId" });
      socket.end();
      return;
    }

    const timer = setTimeout(() => {
      const entry = this.pending.get(correlationId);
      if (!entry) return;
      this.pending.delete(correlationId);
      this.writeSocket(entry.socket, { correlationId, error: "timeout" });
      entry.socket.end();
    }, this.timeoutMs);

    this.pending.set(correlationId, { socket, timer });

    writeNativeFrame(this.opts.stdout, parsed);
  }

  private handleExtensionFrame(message: unknown): void {
    const msg = message as { correlationId?: string };
    if (!msg || typeof msg.correlationId !== "string") {
      return;
    }
    const entry = this.pending.get(msg.correlationId);
    if (!entry) {
      return;
    }
    clearTimeout(entry.timer);
    this.pending.delete(msg.correlationId);
    this.writeSocket(entry.socket, msg);
    entry.socket.end();
  }

  private writeSocket(socket: net.Socket, payload: unknown): void {
    if (socket.writable) {
      socket.write(JSON.stringify(payload) + "\n");
    }
  }

  private async shutdown(): Promise<void> {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.socket.destroy();
    }
    this.pending.clear();
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
    try {
      fs.unlinkSync(this.opts.socketPath);
    } catch {
      // ignore
    }
  }

  private async unlinkStale(socketPath: string): Promise<void> {
    if (!fs.existsSync(socketPath)) return;
    const reachable = await new Promise<boolean>((resolve) => {
      const probe = net.createConnection(socketPath);
      probe.once("connect", () => {
        probe.destroy();
        resolve(true);
      });
      probe.once("error", () => resolve(false));
    });
    if (reachable) {
      throw new Error(`socket ${socketPath} already in use by another browser-control-cli host`);
    }
    fs.unlinkSync(socketPath);
  }

  private async ensureParentDir(socketPath: string): Promise<void> {
    const dir = path.dirname(socketPath);
    await fs.promises.mkdir(dir, { recursive: true });
  }
}

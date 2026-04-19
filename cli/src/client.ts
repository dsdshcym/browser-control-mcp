import * as fs from "fs";
import * as net from "net";
import { randomUUID } from "crypto";
import type { ServerMessage } from "@browser-control-mcp/common";
import { resolveSocketPath } from "./socket-path";

export interface SendOptions {
  socketPath?: string;
  timeoutMs?: number;
}

export class CliError extends Error {
  constructor(message: string, readonly hint?: string) {
    super(message);
  }
}

export async function sendRequest(cmd: ServerMessage, opts: SendOptions = {}): Promise<unknown> {
  const socketPath = opts.socketPath ?? resolveSocketPath();
  if (!fs.existsSync(socketPath)) {
    throw new CliError(
      `socket not found at ${socketPath}`,
      "Is Firefox running with the Browser Control CLI extension installed?",
    );
  }

  const payload = { ...cmd, correlationId: randomUUID() };

  return await new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath);
    let buf = "";
    const timeout = setTimeout(() => {
      sock.destroy();
      reject(new CliError("CLI request timed out"));
    }, opts.timeoutMs ?? 30_000);

    sock.on("connect", () => sock.write(JSON.stringify(payload) + "\n"));
    sock.on("data", (chunk: Buffer) => { buf += chunk.toString("utf-8"); });
    sock.on("end", () => {
      clearTimeout(timeout);
      const line = buf.trim();
      if (!line) {
        reject(new CliError("empty response from native-host"));
        return;
      }
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(new CliError(`failed to parse response: ${(err as Error).message}`));
      }
    });
    sock.on("error", (err) => {
      clearTimeout(timeout);
      reject(new CliError(`socket error: ${err.message}`));
    });
  });
}

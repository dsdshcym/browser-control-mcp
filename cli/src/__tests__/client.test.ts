import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { sendRequest, CliError } from "../client";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-client-${process.pid}-${Date.now()}.sock`);
}

async function withEchoServer<T>(socketPath: string, fn: () => Promise<T>): Promise<T> {
  const server = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (chunk: Buffer) => {
      buf += chunk.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const req = JSON.parse(buf.slice(0, nl));
      sock.write(JSON.stringify({ correlationId: req.correlationId, resource: "echo", cmd: req.cmd }) + "\n");
      sock.end();
    });
  });

  await new Promise<void>((resolve) => server.listen(socketPath, () => resolve()));
  try {
    return await fn();
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  }
}

test("client: writes JSON + newline and returns the parsed response", async () => {
  const socketPath = tempSocketPath();
  await withEchoServer(socketPath, async () => {
    const reply = (await sendRequest({ cmd: "get-tab-list" }, { socketPath })) as { resource: string; cmd: string };
    assert.equal(reply.resource, "echo");
    assert.equal(reply.cmd, "get-tab-list");
  });
});

test("client: throws CliError with a hint if socket does not exist", async () => {
  const socketPath = tempSocketPath();
  await assert.rejects(
    sendRequest({ cmd: "get-tab-list" }, { socketPath }),
    (err) => err instanceof CliError && /socket not found/.test(err.message) && !!err.hint,
  );
});

test("client: rejects when server reply carries an error field", async () => {
  const socketPath = tempSocketPath();
  const server = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (c: Buffer) => {
      buf += c.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const req = JSON.parse(buf.slice(0, nl));
      sock.write(JSON.stringify({ correlationId: req.correlationId, error: "permission denied" }) + "\n");
      sock.end();
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, () => r()));
  try {
    await assert.rejects(
      sendRequest({ cmd: "get-tab-list" }, { socketPath }),
      (err) => err instanceof CliError && /permission denied/.test(err.message),
    );
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  }
});

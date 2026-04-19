import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PassThrough } from "node:stream";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { Bridge } from "../bridge";
import { NativeFrameReader, writeNativeFrame } from "../native-framing";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sock`);
}

async function connectAndRequest(socketPath: string, payload: object): Promise<unknown> {
  return await new Promise((resolve, reject) => {
    const sock = net.createConnection(socketPath);
    let buf = "";
    sock.on("data", (chunk: Buffer) => { buf += chunk.toString("utf-8"); });
    sock.on("end", () => {
      try { resolve(JSON.parse(buf.trim())); } catch (e) { reject(e); }
    });
    sock.on("error", reject);
    sock.on("connect", () => sock.write(JSON.stringify(payload) + "\n"));
  });
}

test("bridge: demuxes replies to the originating socket by correlationId", async () => {
  const socketPath = tempSocketPath();
  const stdinIn = new PassThrough();
  const stdoutOut = new PassThrough();

  const bridge = new Bridge({ socketPath, stdin: stdinIn, stdout: stdoutOut });
  await bridge.start();

  // Pretend to be the extension: read frames from stdout, write responses to stdin.
  const reader = new NativeFrameReader((msg) => {
    const req = msg as { correlationId: string; cmd: string };
    const reply = { correlationId: req.correlationId, resource: "echo", cmd: req.cmd };
    writeNativeFrame(stdinIn, reply);
  });
  stdoutOut.on("data", (chunk: Buffer) => reader.push(chunk));

  const [a, b] = await Promise.all([
    connectAndRequest(socketPath, { correlationId: "a", cmd: "get-tab-list" }),
    connectAndRequest(socketPath, { correlationId: "b", cmd: "get-current-tab" }),
  ]);

  assert.deepEqual(a, { correlationId: "a", resource: "echo", cmd: "get-tab-list" });
  assert.deepEqual(b, { correlationId: "b", resource: "echo", cmd: "get-current-tab" });

  await bridge.stop();
  assert.equal(fs.existsSync(socketPath), false, "socket file cleaned up");
});

test("bridge: times out when extension never replies", async () => {
  const socketPath = tempSocketPath();
  const stdinIn = new PassThrough();
  const stdoutOut = new PassThrough();

  const bridge = new Bridge({ socketPath, stdin: stdinIn, stdout: stdoutOut, timeoutMs: 50 });
  await bridge.start();

  // Drain but never reply.
  stdoutOut.on("data", () => {});

  const reply = (await connectAndRequest(socketPath, { correlationId: "x", cmd: "get-tab-list" })) as { error: string };
  assert.equal(reply.error, "timeout");

  await bridge.stop();
});

test("bridge: rejects requests missing correlationId", async () => {
  const socketPath = tempSocketPath();
  const stdinIn = new PassThrough();
  const stdoutOut = new PassThrough();

  const bridge = new Bridge({ socketPath, stdin: stdinIn, stdout: stdoutOut });
  await bridge.start();

  const reply = (await connectAndRequest(socketPath, { cmd: "get-tab-list" })) as { error: string };
  assert.ok(reply.error.includes("correlationId"));

  await bridge.stop();
});

test("bridge: refuses to start when socket is actively in use", async () => {
  const socketPath = tempSocketPath();
  const first = new Bridge({ socketPath, stdin: new PassThrough(), stdout: new PassThrough() });
  await first.start();

  const second = new Bridge({ socketPath, stdin: new PassThrough(), stdout: new PassThrough() });
  await assert.rejects(second.start(), /already in use/);

  await first.stop();
});

import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";

const CLI_PATH = path.resolve(__dirname, "..", "..", "dist", "main.js");

function tempRuntimeDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bc-cli-pipe-"));
  return dir;
}

async function startReplyServer(socketPath: string, replyPayload: unknown): Promise<net.Server> {
  const server = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (c: Buffer) => {
      buf += c.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const req = JSON.parse(buf.slice(0, nl));
      const body = { correlationId: req.correlationId, ...(replyPayload as object) };
      sock.write(JSON.stringify(body) + "\n");
      sock.end();
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, () => r()));
  return server;
}

function runCli(args: string[], env: NodeJS.ProcessEnv): Promise<{ stdout: Buffer; stderr: Buffer; code: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    child.stdout.on("data", (c: Buffer) => outChunks.push(c));
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ stdout: Buffer.concat(outChunks), stderr: Buffer.concat(errChunks), code });
    });
  });
}

test("stdout is not truncated when piped and payload exceeds 64 KiB", async () => {
  assert.ok(fs.existsSync(CLI_PATH), `CLI binary not built at ${CLI_PATH}; run npm run build first`);

  const runtimeDir = tempRuntimeDir();
  const socketPath = path.join(runtimeDir, "browser-control-cli.sock");

  const bigHtml = "a".repeat(200_000);
  const reply = {
    resource: "tab-content",
    tabId: 1,
    html: bigHtml,
    isTruncated: false,
    totalLength: bigHtml.length,
  };

  const server = await startReplyServer(socketPath, reply);
  try {
    const { stdout, code } = await runCli(["get-content", "1"], { XDG_RUNTIME_DIR: runtimeDir });
    assert.equal(code, 0, `CLI exited ${code}; stdout bytes=${stdout.length}`);
    assert.notEqual(stdout.length, 65_536, "stdout truncated at 65536 bytes — pipe flush bug");
    const parsed = JSON.parse(stdout.toString("utf-8"));
    assert.equal(parsed.html.length, bigHtml.length);
    assert.equal(parsed.totalLength, bigHtml.length);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

test("stderr is not truncated when piped and error payload is large", async () => {
  assert.ok(fs.existsSync(CLI_PATH), `CLI binary not built at ${CLI_PATH}; run npm run build first`);

  const runtimeDir = tempRuntimeDir();
  const socketPath = path.join(runtimeDir, "browser-control-cli.sock");

  const bigMessage = "e".repeat(200_000);
  const reply = { error: bigMessage };

  const server = await startReplyServer(socketPath, reply);
  try {
    const { stderr, code } = await runCli(["list-tabs"], { XDG_RUNTIME_DIR: runtimeDir });
    assert.equal(code, 1, `expected exit 1, got ${code}`);
    assert.notEqual(stderr.length, 65_536, "stderr truncated at 65536 bytes — pipe flush bug");
    const parsed = JSON.parse(stderr.toString("utf-8"));
    assert.equal(parsed.error.length, bigMessage.length);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
});

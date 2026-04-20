import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { getContent } from "../commands/get-content";
import { CliError } from "../client";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-content-${process.pid}-${Date.now()}.sock`);
}

async function withEcho<T>(fn: (socketPath: string, received: any[]) => Promise<T>): Promise<T> {
  const socketPath = tempSocketPath();
  const received: any[] = [];
  const server = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (c: Buffer) => {
      buf += c.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const req = JSON.parse(buf.slice(0, nl));
      received.push(req);
      sock.write(JSON.stringify({
        correlationId: req.correlationId,
        resource: "tab-content",
        tabId: req.tabId,
        html: "<html/>",
        isTruncated: false,
        totalLength: 7,
      }) + "\n");
      sock.end();
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, () => r()));
  try {
    return await fn(socketPath, received);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  }
}

test("get-content: forwards tab id", async () => {
  await withEcho(async (socketPath, received) => {
    const reply = (await getContent(["42"], { socketPath })) as { resource: string; tabId: number; html: string };
    assert.equal(reply.resource, "tab-content");
    assert.equal(reply.html, "<html/>");
    assert.equal(received[0].tabId, 42);
    assert.equal(received[0].offset, undefined);
  });
});

test("get-content: forwards --offset", async () => {
  await withEcho(async (socketPath, received) => {
    await getContent(["42", "--offset", "100"], { socketPath });
    assert.equal(received[0].offset, 100);
  });
});

test("get-content: rejects missing id", async () => {
  await assert.rejects(
    async () => getContent([]),
    (err) => err instanceof CliError && /requires a tab id/.test(err.message),
  );
});

test("get-content: rejects unknown flag", async () => {
  await assert.rejects(
    async () => getContent(["42", "--bogus"]),
    (err) => err instanceof CliError && /unknown flag/.test(err.message),
  );
});

test("get-content: rejects --html (no longer accepted; html is the default)", async () => {
  await assert.rejects(
    async () => getContent(["42", "--html"]),
    (err) => err instanceof CliError && /unknown flag/.test(err.message),
  );
});

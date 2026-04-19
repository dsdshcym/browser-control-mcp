import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { openTab } from "../commands/open-tab";
import { CliError } from "../client";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-open-${process.pid}-${Date.now()}.sock`);
}

test("open-tab: sends cmd with the url and returns the opened tab id", async () => {
  const socketPath = tempSocketPath();
  const received: { cmd: string; url: string }[] = [];

  const server = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (c: Buffer) => {
      buf += c.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const req = JSON.parse(buf.slice(0, nl));
      received.push(req);
      sock.write(JSON.stringify({ correlationId: req.correlationId, resource: "opened-tab-id", tabId: 7 }) + "\n");
      sock.end();
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, () => r()));

  try {
    const reply = (await openTab(["https://example.com"], { socketPath })) as { tabId: number };
    assert.equal(reply.tabId, 7);
    assert.equal(received[0].cmd, "open-tab");
    assert.equal(received[0].url, "https://example.com");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  }
});

test("open-tab: rejects missing URL", async () => {
  await assert.rejects(
    async () => openTab([]),
    (err) => err instanceof CliError && /requires a URL/.test(err.message),
  );
});

test("open-tab: rejects non-https URLs", async () => {
  await assert.rejects(
    async () => openTab(["http://example.com"]),
    (err) => err instanceof CliError && /https:\/\//.test(err.message),
  );
});

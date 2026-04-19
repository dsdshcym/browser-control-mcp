import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { currentTab } from "../commands/current-tab";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-current-${process.pid}-${Date.now()}.sock`);
}

test("current-tab: sends get-current-tab and returns the server reply", async () => {
  const socketPath = tempSocketPath();
  const received: { cmd: string }[] = [];

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
        resource: "current-tab",
        tab: { id: 42, url: "https://example.com", title: "Example" },
      }) + "\n");
      sock.end();
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, () => r()));

  try {
    const reply = (await currentTab([], { socketPath })) as { resource: string; tab: { id: number } };
    assert.equal(reply.resource, "current-tab");
    assert.equal(reply.tab.id, 42);
    assert.equal(received[0].cmd, "get-current-tab");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  }
});

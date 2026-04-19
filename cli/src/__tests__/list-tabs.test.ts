import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { listTabs } from "../commands/list-tabs";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-list-${process.pid}-${Date.now()}.sock`);
}

test("list-tabs: sends get-tab-list and returns the server reply", async () => {
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
      sock.write(JSON.stringify({ correlationId: req.correlationId, resource: "tabs", tabs: [{ id: 1 }] }) + "\n");
      sock.end();
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, () => r()));

  try {
    const reply = (await listTabs([], { socketPath })) as { resource: string; tabs: unknown[] };
    assert.equal(reply.resource, "tabs");
    assert.deepEqual(reply.tabs, [{ id: 1 }]);
    assert.equal(received[0].cmd, "get-tab-list");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  }
});

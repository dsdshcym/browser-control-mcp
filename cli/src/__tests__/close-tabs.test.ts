import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { closeTabs } from "../commands/close-tabs";
import { CliError } from "../client";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-close-${process.pid}-${Date.now()}.sock`);
}

test("close-tabs: forwards integer ids", async () => {
  const socketPath = tempSocketPath();
  const received: { cmd: string; tabIds: number[] }[] = [];

  const server = net.createServer((sock) => {
    let buf = "";
    sock.on("data", (c: Buffer) => {
      buf += c.toString("utf-8");
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const req = JSON.parse(buf.slice(0, nl));
      received.push(req);
      sock.write(JSON.stringify({ correlationId: req.correlationId, resource: "tabs-closed" }) + "\n");
      sock.end();
    });
  });
  await new Promise<void>((r) => server.listen(socketPath, () => r()));

  try {
    const reply = (await closeTabs(["1", "2", "3"], { socketPath })) as { resource: string };
    assert.equal(reply.resource, "tabs-closed");
    assert.deepEqual(received[0].tabIds, [1, 2, 3]);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
  }
});

test("close-tabs: rejects when no ids provided", async () => {
  await assert.rejects(
    async () => closeTabs([]),
    (err) => err instanceof CliError && /at least one tab id/.test(err.message),
  );
});

test("close-tabs: rejects non-integer ids", async () => {
  await assert.rejects(
    async () => closeTabs(["abc"]),
    (err) => err instanceof CliError && /invalid tab id/.test(err.message),
  );
});

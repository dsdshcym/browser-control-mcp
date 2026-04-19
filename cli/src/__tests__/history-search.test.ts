import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { historySearch } from "../commands/history-search";
import { CliError } from "../client";

function tempSocketPath(): string {
  return path.join(os.tmpdir(), `bc-cli-hist-${process.pid}-${Date.now()}.sock`);
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
      sock.write(JSON.stringify({ correlationId: req.correlationId, resource: "history", historyItems: [] }) + "\n");
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

test("history-search: forwards no query when none given", async () => {
  await withEcho(async (socketPath, received) => {
    await historySearch([], { socketPath });
    assert.equal(received[0].cmd, "get-browser-recent-history");
    assert.equal(received[0].searchQuery, undefined);
  });
});

test("history-search: forwards the query argument", async () => {
  await withEcho(async (socketPath, received) => {
    await historySearch(["nextjs"], { socketPath });
    assert.equal(received[0].searchQuery, "nextjs");
  });
});

test("history-search: rejects more than one arg", async () => {
  await assert.rejects(
    async () => historySearch(["a", "b"]),
    (err) => err instanceof CliError && /at most one query/.test(err.message),
  );
});

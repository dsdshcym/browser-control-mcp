import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveHostBinary } from "../commands/install-host";
import { CliError } from "../client";

test("resolveHostBinary: honors BROWSER_CONTROL_HOST when set", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bc-cli-host-"));
  const fake = path.join(tmp, "host.js");
  fs.writeFileSync(fake, "#!/usr/bin/env node\n");
  const prior = process.env.BROWSER_CONTROL_HOST;
  process.env.BROWSER_CONTROL_HOST = fake;
  try {
    const resolved = resolveHostBinary();
    assert.equal(resolved, fs.realpathSync(fake));
  } finally {
    if (prior === undefined) delete process.env.BROWSER_CONTROL_HOST;
    else process.env.BROWSER_CONTROL_HOST = prior;
    fs.rmSync(tmp, { recursive: true });
  }
});

test("resolveHostBinary: throws CliError if override is missing", () => {
  assert.throws(
    () => resolveHostBinary("/definitely/not/here"),
    (err) => err instanceof CliError && /missing file/.test(err.message),
  );
});

test("install-host: writes the manifest via the host binary", async () => {
  const { installHost } = await import("../commands/install-host");

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "bc-cli-instH-"));
  const priorHome = process.env.HOME;
  process.env.HOME = tmpHome;

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const hostBin = path.join(repoRoot, "native-host", "dist", "host.js");

  try {
    // The integration test assumes native-host has been built.
    if (!fs.existsSync(hostBin)) {
      // skip: no built host
      return;
    }
    const reply = (await installHost([], { hostBinaryOverride: hostBin })) as { resource: string; output: string };
    assert.equal(reply.resource, "install-host");
    const manifestDir = process.platform === "darwin"
      ? path.join(tmpHome, "Library", "Application Support", "Mozilla", "NativeMessagingHosts")
      : path.join(tmpHome, ".mozilla", "native-messaging-hosts");
    const manifestFile = path.join(manifestDir, "browser_control_cli_host.json");
    assert.equal(fs.existsSync(manifestFile), true, `manifest missing at ${manifestFile}`);
    const contents = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
    assert.equal(contents.name, "browser_control_cli_host");
    assert.equal(contents.path, fs.realpathSync(hostBin));
  } finally {
    if (priorHome === undefined) delete process.env.HOME;
    else process.env.HOME = priorHome;
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
});

import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { install, uninstall, manifestPathsFor, HOST_NAME, DEFAULT_ALLOWED_EXTENSION_IDS } from "../manifest";

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-cli-manifest-"));
}

function writeFakeHost(dir: string, name = "host.js"): string {
  const p = path.join(dir, name);
  fs.writeFileSync(p, "#!/usr/bin/env node\n", { mode: 0o755 });
  return p;
}

test("manifestPathsFor returns macOS path under ~/Library", () => {
  const paths = manifestPathsFor("darwin", "/fake/home");
  assert.equal(paths.dir, "/fake/home/Library/Application Support/Mozilla/NativeMessagingHosts");
  assert.equal(paths.file, path.join(paths.dir, `${HOST_NAME}.json`));
});

test("manifestPathsFor returns Linux path under ~/.mozilla", () => {
  const paths = manifestPathsFor("linux", "/fake/home");
  assert.equal(paths.dir, "/fake/home/.mozilla/native-messaging-hosts");
});

test("manifestPathsFor throws on unsupported platform", () => {
  assert.throws(() => manifestPathsFor("win32" as NodeJS.Platform, "/fake/home"), /unsupported platform/);
});

test("install writes a launcher wrapper and a manifest pointing at it", () => {
  const home = tempHome();
  const paths = {
    dir: path.join(home, "custom"),
    file: path.join(home, "custom", `${HOST_NAME}.json`),
  };
  const hostBin = writeFakeHost(home);

  const result = install({
    hostBinaryPath: hostBin,
    nodeBinaryPath: "/opt/homebrew/bin/node",
    paths,
  });

  assert.equal(result.manifestFile, paths.file);
  assert.equal(result.wrapperFile, path.join(paths.dir, `${HOST_NAME}-launcher.sh`));
  assert.equal(result.nodeBinaryPath, "/opt/homebrew/bin/node");

  const manifest = JSON.parse(fs.readFileSync(paths.file, "utf-8"));
  assert.equal(manifest.name, HOST_NAME);
  assert.equal(manifest.path, result.wrapperFile);
  assert.equal(manifest.type, "stdio");
  assert.deepEqual(manifest.allowed_extensions, DEFAULT_ALLOWED_EXTENSION_IDS);

  const wrapper = fs.readFileSync(result.wrapperFile, "utf-8");
  assert.match(wrapper, /^#!\/bin\/sh/);
  assert.ok(wrapper.includes("'/opt/homebrew/bin/node'"), "wrapper should exec an absolute node");
  assert.ok(wrapper.includes(`'${fs.realpathSync(hostBin)}'`), "wrapper should pass the host script absolutely");
  const mode = fs.statSync(result.wrapperFile).mode & 0o777;
  assert.equal(mode, 0o755);

  assert.equal(uninstall(paths), true);
  assert.equal(fs.existsSync(paths.file), false);
  assert.equal(fs.existsSync(result.wrapperFile), false);
  assert.equal(uninstall(paths), false, "second uninstall is a no-op");
});

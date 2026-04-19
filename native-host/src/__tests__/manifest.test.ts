import { strict as assert } from "node:assert";
import { test } from "node:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { install, uninstall, manifestPathsFor, HOST_NAME, DEFAULT_ALLOWED_EXTENSION_IDS } from "../manifest";

function tempHome(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bc-cli-manifest-"));
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

test("install writes a valid manifest and uninstall removes it", () => {
  const home = tempHome();
  const paths = {
    dir: path.join(home, "custom"),
    file: path.join(home, "custom", `${HOST_NAME}.json`),
  };

  const written = install({ hostBinaryPath: "/opt/browser-control-cli-host", paths });
  assert.equal(written, paths.file);
  assert.equal(fs.existsSync(paths.file), true);

  const manifest = JSON.parse(fs.readFileSync(paths.file, "utf-8"));
  assert.equal(manifest.name, HOST_NAME);
  assert.equal(manifest.path, "/opt/browser-control-cli-host");
  assert.equal(manifest.type, "stdio");
  assert.deepEqual(manifest.allowed_extensions, DEFAULT_ALLOWED_EXTENSION_IDS);

  assert.equal(uninstall(paths), true);
  assert.equal(fs.existsSync(paths.file), false);
  assert.equal(uninstall(paths), false, "second uninstall is a no-op");
});

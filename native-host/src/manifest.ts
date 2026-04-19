import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const HOST_NAME = "browser_control_cli_host";

// Extension ID declared in extension/manifest.json (browser_specific_settings.gecko.id).
export const DEFAULT_ALLOWED_EXTENSION_IDS = ["browser-control-cli@anthropic.com"];

export interface ManifestPaths {
  dir: string;
  file: string;
}

export function manifestPathsFor(platform: NodeJS.Platform = process.platform, home: string = os.homedir()): ManifestPaths {
  let dir: string;
  switch (platform) {
    case "darwin":
      dir = path.join(home, "Library", "Application Support", "Mozilla", "NativeMessagingHosts");
      break;
    case "linux":
      dir = path.join(home, ".mozilla", "native-messaging-hosts");
      break;
    default:
      throw new Error(`unsupported platform: ${platform}`);
  }
  return { dir, file: path.join(dir, `${HOST_NAME}.json`) };
}

export interface InstallOptions {
  hostBinaryPath: string;
  nodeBinaryPath?: string;
  allowedExtensionIds?: string[];
  paths?: ManifestPaths;
}

export interface InstallResult {
  manifestFile: string;
  wrapperFile: string;
  nodeBinaryPath: string;
}

/**
 * Firefox on macOS spawns native-messaging hosts with a minimal PATH that
 * does not include Homebrew or nvm shims, so a plain `#!/usr/bin/env node`
 * shebang fails silently. Drop a POSIX wrapper next to the manifest that
 * exec's an absolute node with an absolute host-script path, and point the
 * manifest at the wrapper.
 */
export function install(opts: InstallOptions): InstallResult {
  const paths = opts.paths ?? manifestPathsFor();
  fs.mkdirSync(paths.dir, { recursive: true });

  const hostBinaryPath = fs.realpathSync(opts.hostBinaryPath);
  const nodeBinaryPath = opts.nodeBinaryPath ?? process.execPath;
  const wrapperFile = path.join(paths.dir, `${HOST_NAME}-launcher.sh`);

  const wrapper = `#!/bin/sh
exec ${shellQuote(nodeBinaryPath)} ${shellQuote(hostBinaryPath)} "$@"
`;
  fs.writeFileSync(wrapperFile, wrapper, { mode: 0o755 });

  const manifest = {
    name: HOST_NAME,
    description: "Browser Control CLI native messaging host",
    path: wrapperFile,
    type: "stdio",
    allowed_extensions: opts.allowedExtensionIds ?? DEFAULT_ALLOWED_EXTENSION_IDS,
  };
  fs.writeFileSync(paths.file, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o644 });

  return { manifestFile: paths.file, wrapperFile, nodeBinaryPath };
}

export function uninstall(paths: ManifestPaths = manifestPathsFor()): boolean {
  const wrapperFile = path.join(paths.dir, `${HOST_NAME}-launcher.sh`);
  let removed = false;
  if (fs.existsSync(paths.file)) {
    fs.unlinkSync(paths.file);
    removed = true;
  }
  if (fs.existsSync(wrapperFile)) {
    fs.unlinkSync(wrapperFile);
    removed = true;
  }
  return removed;
}

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}

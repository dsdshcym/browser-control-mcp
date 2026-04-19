import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export const HOST_NAME = "browser_control_cli_host";

// Extension ID declared in extension/manifest.json (browser_specific_settings.gecko.id).
export const DEFAULT_ALLOWED_EXTENSION_IDS = ["browser-control-mcp@anthropic.com"];

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
  allowedExtensionIds?: string[];
  paths?: ManifestPaths;
}

export function install(opts: InstallOptions): string {
  const paths = opts.paths ?? manifestPathsFor();
  fs.mkdirSync(paths.dir, { recursive: true });
  const manifest = {
    name: HOST_NAME,
    description: "Browser Control CLI native messaging host",
    path: opts.hostBinaryPath,
    type: "stdio",
    allowed_extensions: opts.allowedExtensionIds ?? DEFAULT_ALLOWED_EXTENSION_IDS,
  };
  fs.writeFileSync(paths.file, JSON.stringify(manifest, null, 2) + "\n", { mode: 0o644 });
  return paths.file;
}

export function uninstall(paths: ManifestPaths = manifestPathsFor()): boolean {
  if (!fs.existsSync(paths.file)) return false;
  fs.unlinkSync(paths.file);
  return true;
}

import * as os from "os";
import * as path from "path";

export function resolveSocketPath(): string {
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  if (runtimeDir) {
    return path.join(runtimeDir, "browser-control-cli.sock");
  }
  const tmp = process.env.TMPDIR ?? "/tmp";
  const uid = typeof process.getuid === "function" ? process.getuid() : 0;
  return path.join(tmp, `browser-control-cli-${uid}.sock`);
}

export function defaultRuntimeHome(): string {
  return path.join(os.homedir(), ".browser-control-cli");
}

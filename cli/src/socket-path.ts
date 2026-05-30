import * as os from "os";
import * as path from "path";

export function resolveSocketPath(): string {
  const runtimeDir = process.env.XDG_RUNTIME_DIR;
  if (runtimeDir) {
    return path.join(runtimeDir, "browser-control-cli.sock");
  }
  // Anchor to the user's home, not $TMPDIR: the host is spawned by Firefox
  // (real per-user temp) while a CLI caller may have a rewritten $TMPDIR
  // (e.g. a sandboxed agent harness). A home-based path resolves identically
  // in both processes regardless of $TMPDIR.
  return path.join(defaultRuntimeHome(), "browser-control-cli.sock");
}

export function defaultRuntimeHome(): string {
  return path.join(os.homedir(), ".browser-control-cli");
}

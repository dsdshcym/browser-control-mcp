import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { CliError } from "../client";

export interface InstallHostOptions {
  hostBinaryOverride?: string;
}

// Resolve the browser-control-cli-host binary. Default lookup order:
//   1. BROWSER_CONTROL_HOST env var
//   2. Sibling file next to this binary (../native-host/dist/host.js).
//   3. Whatever `which browser-control-cli-host` finds.
export function resolveHostBinary(override?: string): string {
  const fromEnv = process.env.BROWSER_CONTROL_HOST;
  const candidate = override ?? fromEnv;
  if (candidate) {
    if (!fs.existsSync(candidate)) {
      throw new CliError(`BROWSER_CONTROL_HOST points at missing file: ${candidate}`);
    }
    return fs.realpathSync(candidate);
  }

  // Sibling path: when installed via npm, both cli and native-host are in the same
  // node_modules tree. Walk up to find native-host/dist/host.js.
  const cliEntry = process.argv[1];
  const startDir = path.dirname(fs.realpathSync(cliEntry));
  const candidates = [
    path.resolve(startDir, "../../native-host/dist/host.js"),
    path.resolve(startDir, "../native-host/dist/host.js"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  // Fall back to PATH lookup.
  const which = spawnSync("which", ["browser-control-cli-host"], { encoding: "utf-8" });
  const fromPath = which.stdout.trim();
  if (which.status === 0 && fromPath && fs.existsSync(fromPath)) {
    return fs.realpathSync(fromPath);
  }

  throw new CliError(
    "could not locate browser-control-cli-host",
    "Set BROWSER_CONTROL_HOST to the path of the host binary, or ensure it's on PATH.",
  );
}

export function installHost(args: string[], opts: InstallHostOptions = {}): Promise<unknown> {
  if (args.length > 0) {
    throw new CliError("install-host takes no arguments");
  }
  const hostBin = resolveHostBinary(opts.hostBinaryOverride);
  const isJs = hostBin.endsWith(".js");
  // Invoke the host's own `install` subcommand so path logic stays in one place.
  const cmd = isJs ? process.execPath : hostBin;
  const argv = isJs ? [hostBin, "install"] : ["install"];
  const result = spawnSync(cmd, argv, { encoding: "utf-8" });
  if (result.status !== 0) {
    throw new CliError(`host install failed: ${result.stderr || result.stdout}`);
  }
  return Promise.resolve({ resource: "install-host", output: result.stdout.trim() });
}

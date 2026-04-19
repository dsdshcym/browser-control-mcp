import * as fs from "fs";
import { Bridge } from "./bridge";
import { resolveSocketPath } from "./socket-path";
import { install, uninstall, manifestPathsFor } from "./manifest";

async function runBridge(): Promise<void> {
  const socketPath = resolveSocketPath();
  const bridge = new Bridge({
    socketPath,
    stdin: process.stdin,
    stdout: process.stdout,
  });

  const stop = () => {
    bridge.stop().finally(() => process.exit(0));
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await bridge.start();
}

function runInstall(): void {
  const hostBinaryPath = fs.realpathSync(process.argv[1]);
  const manifestFile = install({ hostBinaryPath });
  process.stdout.write(`installed: ${manifestFile}\n`);
}

function runUninstall(): void {
  const removed = uninstall();
  const paths = manifestPathsFor();
  process.stdout.write(removed ? `removed: ${paths.file}\n` : `nothing to remove at ${paths.file}\n`);
}

const sub = process.argv[2];
if (sub === "install") {
  runInstall();
} else if (sub === "uninstall") {
  runUninstall();
} else {
  runBridge().catch((err) => {
    console.error("native-host: fatal:", err);
    process.exit(1);
  });
}

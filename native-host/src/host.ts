import { Bridge } from "./bridge";
import { resolveSocketPath } from "./socket-path";

async function main(): Promise<void> {
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

main().catch((err) => {
  console.error("native-host: fatal:", err);
  process.exit(1);
});

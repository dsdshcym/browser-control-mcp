import { emitError } from "./output";

const USAGE = `Usage: browser-control-cli <command> [args]

Commands will be added as verbs are implemented.

General:
  --help, -h    show this help
  --version     show version
`;

function main(argv: string[]): void {
  const [sub, ...rest] = argv;

  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (sub === "--version") {
    process.stdout.write("browser-control-cli 1.5.0\n");
    process.exit(0);
  }

  emitError(`unknown command: ${sub}`);
}

main(process.argv.slice(2));

import { emitError, emitSuccess } from "./output";
import { CliError } from "./client";
import { listTabs } from "./commands/list-tabs";
import { currentTab } from "./commands/current-tab";
import { openTab } from "./commands/open-tab";

const USAGE = `Usage: browser-control-cli <command> [args]

Commands:
  list-tabs             list all open tabs as JSON
  current-tab           get the active tab in the focused window
  open-tab <url>        open a new tab at the given https:// URL

General:
  --help, -h            show this help
  --version             show version
`;

type Handler = (args: string[]) => Promise<unknown>;

const commands: Record<string, Handler> = {
  "list-tabs": listTabs,
  "current-tab": currentTab,
  "open-tab": openTab,
};

async function main(argv: string[]): Promise<void> {
  const [sub, ...rest] = argv;

  if (!sub || sub === "--help" || sub === "-h") {
    process.stdout.write(USAGE);
    process.exit(0);
  }

  if (sub === "--version") {
    process.stdout.write("browser-control-cli 1.5.0\n");
    process.exit(0);
  }

  const handler = commands[sub];
  if (!handler) {
    emitError(`unknown command: ${sub}`);
  }

  try {
    const result = await handler(rest);
    emitSuccess(result);
  } catch (err) {
    if (err instanceof CliError) {
      emitError(err.message, err.hint);
    }
    emitError((err as Error).message ?? String(err));
  }
}

main(process.argv.slice(2));

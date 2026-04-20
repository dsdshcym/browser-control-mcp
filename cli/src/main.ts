import { emitError, emitSuccess } from "./output";
import { CliError } from "./client";
import { listTabs, LIST_TABS_HELP } from "./commands/list-tabs";
import { currentTab, CURRENT_TAB_HELP } from "./commands/current-tab";
import { openTab, OPEN_TAB_HELP } from "./commands/open-tab";
import { closeTabs, CLOSE_TABS_HELP } from "./commands/close-tabs";
import { getContent, GET_CONTENT_HELP } from "./commands/get-content";
import { historySearch, HISTORY_SEARCH_HELP } from "./commands/history-search";
import { installHost, INSTALL_HOST_HELP } from "./commands/install-host";

const USAGE = `Usage: browser-control-cli <command> [args]

Commands:
  list-tabs             list all open tabs
                        → { resource: "tabs", tabs: BrowserTab[] }
  current-tab           get the active tab in the focused window
                        → { resource: "current-tab", tab: BrowserTab }
  open-tab <url>        open a new tab at the given https:// URL
                        → { resource: "opened-tab-id", tabId: number | undefined }
  close-tabs <id>...    close the given tab ids
                        → { resource: "tabs-closed" }
  get-content <id>      read a tab's visible text and links (needs origin permission)
                        [--offset N] skip N chars into body text
                        → { resource: "tab-content", tabId, fullText, isTruncated,
                            totalLength, links: Array<{ url, text }> }
  history-search [q]    recent browser history, optionally filtered by query
                        → { resource: "history", historyItems: BrowserHistoryItem[] }

Shared types:
  BrowserTab         { id?: number, url?: string, title?: string, lastAccessed?: number }
  BrowserHistoryItem { url?: string, title?: string, lastVisitTime?: number }

Errors are emitted on stderr as { error: string, hint?: string } with exit 1.

Setup:
  install-host          install the Firefox native-messaging manifest for this user
                        → { resource: "install-host", output: string }

General:
  --help, -h            show this help
  --version             show version

Run '<command> --help' for the full type shape of a single command.
`;

type Handler = (args: string[]) => Promise<unknown>;

const commands: Record<string, Handler> = {
  "list-tabs": listTabs,
  "current-tab": currentTab,
  "open-tab": openTab,
  "close-tabs": closeTabs,
  "get-content": getContent,
  "history-search": historySearch,
  "install-host": installHost,
};

const commandHelp: Record<string, string> = {
  "list-tabs": LIST_TABS_HELP,
  "current-tab": CURRENT_TAB_HELP,
  "open-tab": OPEN_TAB_HELP,
  "close-tabs": CLOSE_TABS_HELP,
  "get-content": GET_CONTENT_HELP,
  "history-search": HISTORY_SEARCH_HELP,
  "install-host": INSTALL_HOST_HELP,
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

  if (rest[0] === "--help" || rest[0] === "-h") {
    process.stdout.write(commandHelp[sub]);
    process.exit(0);
  }

  try {
    const result = await handler(rest);
    emitSuccess(result);
  } catch (err) {
    if (err instanceof CliError) {
      emitError(err.message, err.hint);
    } else {
      emitError((err as Error).message ?? String(err));
    }
  }
}

main(process.argv.slice(2));

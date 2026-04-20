import { sendRequest, SendOptions, CliError } from "../client";

export const GET_CONTENT_HELP = `Usage: browser-control-cli get-content <id> [--offset N]

Read a tab's rendered outerHTML. Requires the extension to have host
permission for the tab's origin (see the options page).

Pipe the output through your choice of converter, e.g.:
  browser-control-cli get-content <id> | jq -r .html | markitdown
  browser-control-cli get-content <id> | jq -r .html | pandoc -f html -t plain --wrap=none

Flags:
  --offset N    skip the first N characters of outerHTML (useful for paging
                through truncated responses)

Response: {
  resource: "tab-content",
  tabId: number,
  html: string,                 // may be truncated; see isTruncated
  isTruncated: boolean,
  totalLength: number           // length in chars before truncation
}
`;

export function getContent(args: string[], opts: SendOptions = {}): Promise<unknown> {
  let tabIdRaw: string | undefined;
  let offset: number | undefined;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--offset") {
      const next = args[++i];
      if (next === undefined) throw new CliError("--offset requires a value");
      offset = Number(next);
      if (!Number.isInteger(offset) || offset < 0) throw new CliError(`invalid --offset: ${next}`);
    } else if (a.startsWith("--")) {
      throw new CliError(`unknown flag: ${a}`);
    } else if (tabIdRaw === undefined) {
      tabIdRaw = a;
    } else {
      throw new CliError(`unexpected argument: ${a}`);
    }
  }

  if (tabIdRaw === undefined) {
    throw new CliError(
      "get-content requires a tab id",
      "Usage: browser-control-cli get-content <id> [--offset N]",
    );
  }

  const tabId = Number(tabIdRaw);
  if (!Number.isInteger(tabId)) {
    throw new CliError(`invalid tab id: ${tabIdRaw}`);
  }

  const payload = offset !== undefined
    ? { cmd: "get-tab-content" as const, tabId, offset }
    : { cmd: "get-tab-content" as const, tabId };

  return sendRequest(payload, opts);
}

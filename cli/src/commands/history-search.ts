import { sendRequest, SendOptions, CliError } from "../client";

export const HISTORY_SEARCH_HELP = `Usage: browser-control-cli history-search [query]

Recent browser history, optionally filtered by a free-text query matched
against url and title.

Response: {
  resource: "history",
  historyItems: Array<{
    url?: string,
    title?: string,
    lastVisitTime?: number   // epoch ms
  }>
}
`;

export function historySearch(args: string[], opts: SendOptions = {}): Promise<unknown> {
  if (args.length > 1) {
    throw new CliError(
      "history-search takes at most one query argument",
      `Usage: browser-control-cli history-search [query]`,
    );
  }
  const searchQuery = args[0];
  const payload = searchQuery !== undefined
    ? { cmd: "get-browser-recent-history" as const, searchQuery }
    : { cmd: "get-browser-recent-history" as const };
  return sendRequest(payload, opts);
}

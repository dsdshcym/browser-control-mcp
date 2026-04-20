import { sendRequest, SendOptions } from "../client";

export const LIST_TABS_HELP = `Usage: browser-control-cli list-tabs

List every open tab across all windows.

Response: {
  resource: "tabs",
  tabs: Array<{
    id?: number,
    url?: string,
    title?: string,
    lastAccessed?: number   // epoch ms
  }>
}
`;

export function listTabs(_args: string[], opts: SendOptions = {}): Promise<unknown> {
  return sendRequest({ cmd: "get-tab-list" }, opts);
}

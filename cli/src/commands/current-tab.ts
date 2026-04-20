import { sendRequest, SendOptions } from "../client";

export const CURRENT_TAB_HELP = `Usage: browser-control-cli current-tab

Return the active tab in the currently-focused window.

Response: {
  resource: "current-tab",
  tab: {
    id?: number,
    url?: string,
    title?: string,
    lastAccessed?: number   // epoch ms
  }
}
`;

export function currentTab(_args: string[], opts: SendOptions = {}): Promise<unknown> {
  return sendRequest({ cmd: "get-current-tab" }, opts);
}

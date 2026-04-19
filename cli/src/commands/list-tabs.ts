import { sendRequest, SendOptions } from "../client";

export function listTabs(_args: string[], opts: SendOptions = {}): Promise<unknown> {
  return sendRequest({ cmd: "get-tab-list" }, opts);
}

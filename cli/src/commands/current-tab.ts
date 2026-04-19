import { sendRequest, SendOptions } from "../client";

export function currentTab(_args: string[], opts: SendOptions = {}): Promise<unknown> {
  return sendRequest({ cmd: "get-current-tab" }, opts);
}

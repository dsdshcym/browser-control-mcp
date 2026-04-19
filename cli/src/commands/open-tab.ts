import { sendRequest, SendOptions, CliError } from "../client";

export function openTab(args: string[], opts: SendOptions = {}): Promise<unknown> {
  const url = args[0];
  if (!url) {
    throw new CliError("open-tab requires a URL argument", "Usage: browser-control-cli open-tab <url>");
  }
  if (!url.startsWith("https://")) {
    throw new CliError("URL must start with https://");
  }
  return sendRequest({ cmd: "open-tab", url }, opts);
}

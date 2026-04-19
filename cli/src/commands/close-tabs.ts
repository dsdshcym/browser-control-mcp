import { sendRequest, SendOptions, CliError } from "../client";

export function closeTabs(args: string[], opts: SendOptions = {}): Promise<unknown> {
  if (args.length === 0) {
    throw new CliError(
      "close-tabs requires at least one tab id",
      "Usage: browser-control-cli close-tabs <id>...",
    );
  }
  const tabIds: number[] = [];
  for (const raw of args) {
    const n = Number(raw);
    if (!Number.isInteger(n)) {
      throw new CliError(`invalid tab id: ${raw}`);
    }
    tabIds.push(n);
  }
  return sendRequest({ cmd: "close-tabs", tabIds }, opts);
}

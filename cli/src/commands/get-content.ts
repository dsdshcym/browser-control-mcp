import { sendRequest, SendOptions, CliError } from "../client";

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

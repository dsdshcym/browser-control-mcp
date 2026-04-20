import { sendRequest, SendOptions, CliError } from "../client";

export const GET_CONTENT_HELP = `Usage: browser-control-cli get-content <id> [--offset N] [--html]

Read content from a tab. Requires the extension to have host permission for
the tab's origin (see the options page).

By default, returns flattened visible text plus a list of outbound links.
With --html, returns the rendered outerHTML instead — compose a later stage
such as pandoc or markitdown in your own shell pipeline.

Flags:
  --offset N    skip the first N characters of the returned string (text by
                default; HTML when --html is set)
  --html        return document.documentElement.outerHTML instead of
                innerText + links

Response (default): {
  resource: "tab-content",
  tabId: number,
  fullText: string,             // may be truncated; see isTruncated
  isTruncated: boolean,
  totalLength: number,          // length in chars before truncation
  links: Array<{ url: string, text: string }>
}

Response (--html): {
  resource: "tab-content",
  tabId: number,
  html: string,                 // may be truncated; see isTruncated
  isTruncated: boolean,
  totalLength: number
}
`;

export function getContent(args: string[], opts: SendOptions = {}): Promise<unknown> {
  let tabIdRaw: string | undefined;
  let offset: number | undefined;
  let html = false;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--offset") {
      const next = args[++i];
      if (next === undefined) throw new CliError("--offset requires a value");
      offset = Number(next);
      if (!Number.isInteger(offset) || offset < 0) throw new CliError(`invalid --offset: ${next}`);
    } else if (a === "--html") {
      html = true;
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
      "Usage: browser-control-cli get-content <id> [--offset N] [--html]",
    );
  }

  const tabId = Number(tabIdRaw);
  if (!Number.isInteger(tabId)) {
    throw new CliError(`invalid tab id: ${tabIdRaw}`);
  }

  const payload: {
    cmd: "get-tab-content";
    tabId: number;
    offset?: number;
    html?: boolean;
  } = { cmd: "get-tab-content", tabId };
  if (offset !== undefined) payload.offset = offset;
  if (html) payload.html = true;

  return sendRequest(payload, opts);
}

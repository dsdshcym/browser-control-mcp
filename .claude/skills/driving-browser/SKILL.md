---
name: driving-browser
description: Use when you need to read the user's currently-open Firefox tabs, open a URL in their browser, close tabs, search their browser history, or extract webpage content from a real browser session (with cookies, logins, SPA-rendered DOM). Do NOT use for headless scraping or when the user hasn't indicated they want browser-mediated access.
---

# Driving Browser

## What this is

`browser-control-cli` is a local CLI that talks to the user's running Firefox
via a native-messaging extension. Each invocation opens a Unix socket,
sends one JSON line, reads one JSON line, exits.

Use it when you need *the user's actual browser session* — their logins,
their SPA-rendered DOM, their history. Not for headless scraping.

## Quick Reference

All commands print one JSON object on stdout. Errors go to stderr with
exit code 1.

| Command | Purpose |
|---|---|
| `browser-control-cli list-tabs` | enumerate open tabs; returns `{ tabs: [{id, url, title, ...}] }` |
| `browser-control-cli current-tab` | active tab in the focused window; returns `{ tab: {...} }` |
| `browser-control-cli open-tab <https-url>` | open a new tab; returns `{ tabId }` |
| `browser-control-cli close-tabs <id>...` | close tabs by id |
| `browser-control-cli get-content <id> [--offset N]` | tab's rendered **outerHTML** |
| `browser-control-cli history-search [query]` | recent history, optionally filtered |

Run `browser-control-cli <command> --help` for the full response shape.

## get-content returns raw HTML — not plaintext

`get-content` returns `document.documentElement.outerHTML` as captured
from the live, post-hydration DOM:

```json
{
  "resource": "tab-content",
  "tabId": 540,
  "html": "<html>...",
  "isTruncated": false,
  "totalLength": 291856
}
```

**You almost always want to pipe it through a converter.** Raw HTML is
huge (10s–100s of KB) and burns context.

## Converter pipelines

Pipe `get-content` straight into `jq` to pull out the HTML, then into a
converter:

Recommended default (smallest, inline `[text](url)` links, LLM-oriented):

```sh
browser-control-cli get-content "$TAB_ID" | jq -r .html | markitdown
```

Plaintext with structure preserved (drops URLs):

```sh
browser-control-cli get-content "$TAB_ID" | jq -r .html | pandoc -f html -t plain --wrap=none
```

Markdown with links (pandoc alternative):

```sh
browser-control-cli get-content "$TAB_ID" | jq -r .html | pandoc -f html -t gfm-raw_html --wrap=none
```

Just the article body (drops nav, comments, sidebar):

```sh
browser-control-cli get-content "$TAB_ID" | jq -r .html | node -e '
  const {Readability}=require("@mozilla/readability"),
        {JSDOM}=require("jsdom");
  let h="";process.stdin.on("data",c=>h+=c).on("end",()=>{
    const d=new JSDOM(h).window.document;
    console.log(new Readability(d).parse().textContent)})'
```

## Composing commands

Find-then-read:

```sh
TAB_ID=$(browser-control-cli current-tab | jq -r .tab.id)
browser-control-cli get-content "$TAB_ID" | jq -r .html | markitdown
```

Search history then open a result:

```sh
URL=$(browser-control-cli history-search "kubernetes" | jq -r '.historyItems[0].url')
browser-control-cli open-tab "$URL"
```

Pick a tab by URL substring:

```sh
TAB_ID=$(browser-control-cli list-tabs | jq -r '.tabs[] | select(.url | test("github.com")) | .id' | head -1)
```

## Picking a converter

| Need | Pick |
|---|---|
| Smallest, markdown-ish, inline links | `markitdown` |
| Guaranteed-available (old box, restricted env) | `pandoc` |
| Agent will substring-match on the output (e.g. `grep "Thanks @user"`) | `pandoc` — markitdown linkifies mentions |
| Strip all boilerplate, keep only the article | `@mozilla/readability` |
| Need the raw HTML (DOM queries, script-tag JSON) | no converter |

## Common mistakes

- **Skipping `.html` extraction.** The CLI returns a JSON envelope, not
  raw HTML. Feeding the envelope to `pandoc`/`markitdown` gives garbage.
- **Assuming `current-tab` works without a focused Firefox window.** If
  Firefox isn't focused, `.tab.id` is `null`. Fall back to `list-tabs`.
- **Forgetting the origin permission.** First `get-content` on a new
  domain raises a permission dialog in the browser. The CLI returns a
  descriptive error pointing the user at the options page; surface it,
  don't retry silently.
- **Using this for headless scraping.** It drives the user's real
  browser. If you just need to fetch a URL, use `curl` or `WebFetch`.
- **Ignoring `isTruncated`.** The HTML branch caps at 10 MB. If a page
  exceeds that, paginate with `--offset N`.

## When NOT to use

- The user didn't ask for browser-mediated work (use `curl`/`WebFetch`).
- Page is public and doesn't need auth or JS hydration.
- You need multiple parallel fetches (this is one-tab-at-a-time).
- You need Chromium — this is Firefox-only.

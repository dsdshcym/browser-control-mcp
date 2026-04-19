# browser-control-cli

A Firefox extension plus a one-shot CLI that lets LLM agents drive your
browser from a shell. The agent runs commands like `browser-control-cli
list-tabs`, gets JSON back, and decides what to do next.

No MCP server. No persistent daemon. The extension and a native-messaging
host handle everything locally over a Unix domain socket.

## What it can do

| Command                   | Description                                                  |
|---------------------------|--------------------------------------------------------------|
| `list-tabs`               | list all open tabs                                           |
| `current-tab`             | active tab in the focused window                             |
| `open-tab <url>`          | open a new tab (https only)                                  |
| `close-tabs <id>...`      | close one or more tabs by id                                 |
| `get-content <id>`        | read a tab's visible text and links (prompts for origin perm) |
| `history-search [query]`  | recent browser history, optionally filtered                  |
| `install-host`            | install the Firefox native-messaging manifest for this user  |

All commands print one JSON object to stdout on success. Errors go to
stderr (`{"error": "...", "hint": "..."}`) with a non-zero exit code.

## Architecture

```
┌─────────┐  Unix socket  ┌──────────────┐  native-messaging  ┌───────────┐
│   CLI   │ ─────────────▶│  native-host │ ◀─────────────────▶│ extension │
│ one-shot│   JSON/line   │   daemon     │   (4-byte frames)  │ (Firefox) │
└─────────┘               │  spawned by  │                    └───────────┘
                          │    Firefox   │
                          └──────────────┘
```

- **Extension** is the only piece that can touch Firefox's tab / history
  APIs. It lives on AMO.
- **Native host** is a Node process Firefox spawns via the
  native-messaging protocol. It owns the Unix domain socket and
  multiplexes many concurrent CLI clients over the one stdio channel to
  the extension.
- **CLI** is a tiny shebang script (or optional bun-compiled binary).
  Each invocation opens the socket, sends one JSON line, reads one JSON
  line, exits.

Socket path: `$XDG_RUNTIME_DIR/browser-control-cli.sock` if set,
otherwise `$TMPDIR/browser-control-cli-<uid>.sock`. Permissions are
`0600` — filesystem permissions replace the old HMAC shared secret.

See `docs/plans/2026-04-19-browser-control-cli-design.md` for the full
design.

## Install (from source)

```
git clone https://github.com/eyalzh/browser-control-mcp
cd browser-control-mcp
npm install
npm run build
```

Then:

1. **Load the extension** in Firefox:
   - `about:debugging` → "This Firefox" → "Load Temporary Add-on..."
   - pick `extension/manifest.json`
2. **Install the native-messaging manifest** so Firefox can spawn the host:
   ```
   node native-host/dist/host.js install
   ```
   (This drops a `browser_control_cli_host.json` into
   `~/Library/Application Support/Mozilla/NativeMessagingHosts/` on
   macOS or `~/.mozilla/native-messaging-hosts/` on Linux.)
3. **Use the CLI** from anywhere:
   ```
   node cli/dist/main.js list-tabs | jq .
   ```

## Install (later, from npm)

Once published:

```
npm i -g browser-control-cli
browser-control-cli install-host
```

Then install the extension from AMO.

## Examples

```
$ browser-control-cli list-tabs | jq '.tabs | length'
7

$ browser-control-cli open-tab https://news.ycombinator.com | jq .
{"resource":"opened-tab-id","tabId":42}

$ browser-control-cli history-search "rust" | jq '.historyItems | length'
38
```

## Security

- The socket is per-user (`0600`), not network-exposed.
- Reading webpage content (`get-content`) requires the user to grant
  origin permission in the browser — the extension's `optional_permissions`
  include `*://*/*` but Firefox prompts on first use per domain.
- The extension ships with no runtime third-party dependencies and an
  audit log of tool calls, viewable on the options page.
- No remote connections. No telemetry.

## Limitations

- **Firefox only.** Chromium doesn't expose the same `history` /
  `tabs.executeScript` MV2 APIs this extension relies on.
- **macOS and Linux only** in v1. Windows support needs a named-pipe
  path in the socket helpers.
- **One Firefox profile at a time.** The socket path is per-user, not
  per-profile. If two profiles try to start at once, the later one logs
  an "already in use" error.

## Development

```
npm run build                         # all workspaces
npm --workspace=@browser-control/extension test
npm --workspace=@browser-control-mcp/native-host test
npm --workspace=browser-control-cli test
```

## License

MIT.

# browser-control-cli — Design

**Date:** 2026-04-19
**Status:** Accepted
**Branch:** `feat/cli-rewrite`

## Goal

Replace the MCP server with a one-shot CLI that LLM agents invoke as a subprocess.
An agent types `browser-control-cli list-tabs` and gets JSON back. The Firefox
extension and the native-messaging host remain, because they are the only way
to reach browser APIs from an external process.

## Motivation

The current project has four packages (`common/`, `firefox-extension/`,
`mcp-server/`, `native-host/`) and ships two artifacts (a DXT and an XPI) held
together by a shared-secret WebSocket protocol. The MCP layer exists only
because Claude Desktop consumes MCP. For agents running in a shell — Claude
Code, Cursor's terminal agent, any LLM with shell-tool access — MCP is pure
overhead: the agent already knows how to run shell commands.

Cutting MCP lets us:
- Delete the `mcp-server/` package, the DXT build, the HMAC signing.
- Use a Unix domain socket instead of a localhost TCP port (no auth needed — file permissions handle it).
- Reduce install to "install extension + `npm i -g`".

## Non-goals

- Chromium support. Firefox only.
- Windows support in v1 (Unix socket assumes Unix). Named-pipe fallback is a later concern.
- Backwards compatibility with the existing MCP server or its wire protocol. Clean break.
- Web-page modification, scripting, or interaction beyond what the current extension already does.

## Architecture

```
┌─────────┐    Unix socket    ┌──────────────┐   native msg    ┌───────────┐
│   CLI   │ ─────────────────▶│  native-host │ ◀──────────────▶│ extension │
│ (one-   │   JSON req/resp  │   (spawned   │   stdio frames  │ (Firefox) │
│  shot)  │◀──────────────────│   by FF)     │                 │           │
└─────────┘                   └──────────────┘                 └───────────┘
```

### Components

**`extension/`** — Firefox WebExtension. Keeps all current `browser.*` API
code (`message-handler.ts`, `extension-config.ts`, `options.{html,ts}`, audit
log, permission prompts). Loses the in-extension WebSocket server and the
HMAC auth (`auth.ts`). Background script connects to the native host via
`browser.runtime.connectNative` on load and forwards messages.

**`native-host/`** — Node process Firefox spawns. Reads native-messaging
frames from stdin, writes them to stdout. Opens a Unix domain socket and
accepts many concurrent CLI clients. Multiplexes their requests over the
single stdio channel to the extension, routes replies back by
`correlationId`.

**`cli/`** — Node CLI, one-shot. Parses argv, opens the socket, writes one
JSON request, reads one JSON reply, prints it to stdout, exits. Distributed
as a single binary via `bun build --compile`; also installable as an npm
package for users who already have Node.

**`common/`** — Shared TypeScript types for the two wire protocols (CLI↔host,
host↔extension). One dependency for everyone else.

### Lifecycle

1. User installs the extension (from AMO or as a temporary add-on).
2. User runs `browser-control-cli install-host` once. This writes the native-messaging manifest
   to the Firefox-specified path (`~/Library/Application Support/Mozilla/NativeMessagingHosts/`
   on macOS, `~/.mozilla/native-messaging-hosts/` on Linux) pointing at the installed
   `browser-control-cli-host` binary.
3. Firefox starts → extension loads → extension calls
   `browser.runtime.connectNative("browser_control_cli_host")` → Firefox spawns
   the host as a child process.
4. Host opens the Unix socket at `$XDG_RUNTIME_DIR/browser-control-cli.sock`
   (falling back to `~/.browser-control-cli/browser-control-cli.sock`), mode `0600`.
5. CLI invocations connect, transact, disconnect. Host stays alive as long
   as Firefox keeps the native-messaging port open.
6. Firefox closes or extension unloads → host process exits (stdin EOF).

### Rendezvous

- Socket path: `$XDG_RUNTIME_DIR/browser-control-cli.sock` if set, else
  `~/.browser-control-cli/browser-control-cli.sock`. Anchored to `$HOME` rather
  than `$TMPDIR` so the CLI and the Firefox-spawned host agree even when one
  runs under a rewritten `$TMPDIR` (e.g. a sandboxed agent harness).
- Socket permissions: `0600`, owner-only. This replaces the HMAC-shared-secret auth.
- The host removes a stale socket file on start (if `connect()` to it fails).
- CLI exits non-zero with a clear error if the socket does not exist or cannot be reached
  ("is Firefox running with the extension installed?").

### Wire protocol: CLI ↔ host (over Unix socket)

- Transport: one JSON object per connection, newline-delimited (but single-request-per-conn, so the newline is just a safety terminator).
- Request: `{ "correlationId": "<uuid>", "cmd": "<verb>", ...args }`
- Success reply: `{ "correlationId": "<same>", "resource": "<kind>", ...fields }`
- Error reply: `{ "correlationId": "<same>", "error": "<message>" }`
- Host generates `correlationId` if the CLI omits it.

### Wire protocol: host ↔ extension (native messaging stdio)

- Unchanged in shape from today: 4-byte little-endian length + JSON payload.
- Payload is the same `{correlationId, cmd, ...}` request and
  `{correlationId, resource|error, ...}` response used on the socket side.
  The host is a pure passthrough — no translation, just routing.

### Concurrency

- The host accepts multiple simultaneous UDS connections.
- Each incoming request is forwarded to the extension immediately, tagged by
  `correlationId`. Replies from the extension are demuxed back to the
  originating socket using an in-memory `Map<correlationId, Socket>`.
- The extension processes requests serially (matches current behavior — the
  browser APIs it calls are not designed for heavy concurrency anyway).
- Timeout: if no reply arrives within 30s, the host sends
  `{error: "timeout"}` to the CLI and drops the entry.

### Auth & security

- No HMAC. The socket lives in a per-user directory and is `chmod 0600`.
  Any process running as the user can already read the user's browser state
  via other means, so the socket provides no new attack surface.
- The extension retains its existing defenses: per-origin permission prompts
  for content reads, domain deny-list, tool-level enable/disable, audit log.
- The `install-host` command writes only to the current user's Firefox
  profile directories; no sudo needed.

## Commands (v1)

Six verbs. Each maps to a single extension-side operation that already
exists today.

| CLI verb         | Extension cmd            | Description                                            |
|------------------|--------------------------|--------------------------------------------------------|
| `list-tabs`      | `get-tab-list`           | JSON list of all open tabs                             |
| `current-tab`    | `get-current-tab`        | JSON for the active tab in the focused window         |
| `open-tab <url>` | `open-tab`               | Opens a new tab; returns its id                        |
| `close-tabs <ids...>` | `close-tabs`        | Closes the given tab ids                               |
| `get-content <id>` | `get-tab-content`      | Returns text + links for a tab (requires origin perm)  |
| `history-search [query]` | `get-browser-recent-history` | Returns recent history, optionally filtered |

Dropped from today's set: `reorder-tabs`, `group-tabs`, `find-highlight`. They
can come back later if we miss them.

### Output contract

- All successful output: single JSON object to stdout.
- All errors: JSON object `{"error": "..."}` to stderr, exit code non-zero.
- No human-readable mode, no `--json` flag. Pipe through `jq` for human consumption.

### Example

```
$ browser-control-cli list-tabs
{"resource":"tabs","tabs":[{"id":1,"url":"https://example.com","title":"Example"}, ...]}

$ browser-control-cli open-tab https://news.ycombinator.com
{"resource":"opened-tab-id","tabId":42}

$ browser-control-cli get-content 42
{"resource":"tab-content","tabId":42,"fullText":"...","links":[...],"isTruncated":false,"totalLength":1234}
```

## Repo layout

```
browser-control-cli/           (repo renamed on merge)
  common/                      shared TS types
    package.json
    src/
      protocol.ts              CLI/host/extension message types
  extension/                   (renamed from firefox-extension/)
    package.json
    manifest.json
    background.ts
    message-handler.ts         unchanged logic, new transport
    native-bridge.ts           replaces websocket-server.ts
    extension-config.ts
    options.{html,ts}
  native-host/
    package.json
    src/
      host.ts                  rewritten: UDS in, stdio out
  cli/
    package.json
    src/
      main.ts                  commander/cac-based entry
      client.ts                UDS client
      commands/                one file per verb
  docs/
    plans/
  package.json                 npm workspaces root
```

Nx is removed. One root `package.json` with `"workspaces": ["common", "extension", "native-host", "cli"]`.

## Toolchain

- Node + TypeScript across all packages. Bun only for the final
  `bun build --compile` step that produces the single `browser-control-cli`
  binary.
- esbuild keeps bundling the extension (unchanged).
- Jest keeps running the extension's tests (unchanged).
- New: Vitest or node:test for the host and CLI. TBD during implementation.

## Migration

- In-place rewrite on `feat/cli-rewrite` (cut from `main`), not a fresh repo.
  The extension's git history is the part most worth preserving.
- Delete `mcp-server/`, the DXT manifest, the Dockerfile, the HMAC auth
  module, the WebSocket server module, `nx.json`, `.nx/`, `pnpm-workspace.yaml`.
- Rename `firefox-extension/` → `extension/`.
- Update `README.md` last, once the CLI works end-to-end.
- GitHub repo rename (`browser-control-mcp` → `browser-control-cli`) happens
  on merge, not before.

## Risks

- **Native-messaging manifest path differences across OSes.** Solved by a
  per-OS lookup table in `install-host`. Verified paths: macOS
  `~/Library/Application Support/Mozilla/NativeMessagingHosts/`, Linux
  `~/.mozilla/native-messaging-hosts/`. Windows is out of scope for v1.
- **Users running multiple Firefox profiles.** Today's native-messaging
  manifest is per-user, not per-profile, so a single host serves all
  profiles — but they'd race for the socket path. Mitigation: if a profile
  finds the socket already in use, it waits for a disconnect instead of
  overwriting. Detailed behavior TBD during implementation; document the
  limitation in the README.
- **Socket leaks after a crash.** Host unlinks a stale socket on startup
  after a failed connect-probe. Same idiom PostgreSQL uses.
- **Firefox version skew.** The extension already declares
  `strict_min_version: 131.0`. Nothing in this design needs a newer API.

## Commit discipline

Per user request: operations are added, changed, or removed one per commit.
A shared-scaffolding change (new types, new transport, new CLI skeleton)
lands first as its own commit; then each verb lands in its own commit.

The implementation plan (separate doc: `2026-04-19-browser-control-cli-plan.md`)
enumerates these commits.

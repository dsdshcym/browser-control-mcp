# CLAUDE.md

Guidance for Claude Code working in this repository.

## Commands

### Install
```
npm install
```
Uses npm workspaces; there is no post-install step.

### Build everything
```
npm run build
```

### Per-workspace build or test
```
npm --workspace=@browser-control/extension      run build
npm --workspace=@browser-control/extension      test
npm --workspace=@browser-control-mcp/native-host run build
npm --workspace=@browser-control-mcp/native-host test
npm --workspace=browser-control-cli              run build
npm --workspace=browser-control-cli              test
```

### Optional: single-binary compile
```
npm --workspace=browser-control-cli              run build:binary
npm --workspace=@browser-control-mcp/native-host run build:binary
```
Requires Bun. Not needed for day-to-day development.

## Architecture

Four workspaces:

1. **common/** — shared TypeScript message types (CLI↔host↔extension wire protocol).
2. **extension/** — Firefox WebExtension. The only piece with access to `browser.tabs`, `browser.history`, etc. Connects to the native host via `browser.runtime.connectNative("browser_control_cli_host")` and pipes messages straight into `MessageHandler`.
3. **native-host/** — Node process Firefox spawns. Reads native-messaging frames on stdin/stdout, opens a Unix domain socket, multiplexes concurrent CLI clients by `correlationId`.
4. **cli/** — one-shot CLI. Each invocation opens the socket, sends one JSON line, reads one JSON line, exits.

### Communication flow

```
CLI ──UDS──▶ native-host ──native msg──▶ extension ──▶ browser.*
    ◀────────              ◀────────────
```

### Socket path

`$XDG_RUNTIME_DIR/browser-control-cli.sock` if set, else `~/.browser-control-cli/browser-control-cli.sock`. Mode `0600`. Anchored to `$HOME`, not `$TMPDIR`, so the CLI and the Firefox-spawned host resolve the same path even under a rewritten `$TMPDIR` (sandboxed agent harnesses).

### Key files

- `cli/src/main.ts` — entrypoint and subcommand dispatcher
- `cli/src/client.ts` — UDS client (`sendRequest`)
- `cli/src/commands/*.ts` — one file per verb
- `native-host/src/host.ts` — host entrypoint + install/uninstall subcommands
- `native-host/src/bridge.ts` — UDS accept loop + correlationId routing
- `native-host/src/manifest.ts` — platform-aware native-messaging manifest paths
- `extension/background.ts` — boots the native-messaging connection
- `extension/native-bridge.ts` — wires `port` to `MessageHandler`
- `extension/message-handler.ts` — case dispatch for each verb
- `extension/extension-config.ts` — `AVAILABLE_TOOLS`, `COMMAND_TO_TOOL_ID`, audit log, storage
- `common/protocol.ts` — request/response envelope types

## Conventions

- Auth: filesystem permissions on the socket (`0600` in a per-user directory). No HMAC.
- JSON output only. `emitSuccess` prints the payload on stdout and exits 0; `emitError` prints `{error, hint?}` on stderr and exits 1.
- Each CLI verb is a pure function that `return`s the parsed reply; `main.ts` handles printing and exit codes. This keeps verbs easy to unit-test.
- Tests: Jest for `extension/` (browser-API mocks), `node --test` + `tsx` for `native-host/` and `cli/`.
- Commits are atomic per operation. Adding/removing a verb is one commit; a shared-scaffolding change lands first.

## Non-goals

- Chromium support (Firefox-only).
- Windows (macOS and Linux only in v1).
- MCP server / DXT package (removed in the CLI rewrite).

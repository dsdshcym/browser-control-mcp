# browser-control-cli Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite this repo as `browser-control-cli` — a one-shot CLI for LLM agents that talks to a Firefox extension via a Unix-domain-socket bridge. Drop the MCP server entirely.

**Architecture:** CLI → Unix socket → native-messaging host (spawned by Firefox) → Firefox extension. See companion design doc `2026-04-19-browser-control-cli-design.md`.

**Tech Stack:** Node + TypeScript everywhere, npm workspaces, Bun for single-binary compile, esbuild for extension bundle, Jest for extension tests, node:test for CLI/host tests.

**Commit rule:** One operation per commit. A shared-scaffolding change lands first as its own commit; each verb lands in its own commit. Never batch verbs.

---

## Phase 0 — Prepare the branch

### Task 0.1: Remove Emacs autosave artifact

**Files:**
- Delete: `firefox-extension/#websocket-server.ts#`

**Step 1:** `rm 'firefox-extension/#websocket-server.ts#'`
**Step 2:** Confirm gone with `ls firefox-extension/ | grep '^#' || echo clean`
**Step 3:** No commit yet — this file is untracked; nothing to commit.

### Task 0.2: Commit the design + plan docs

**Files:**
- Created: `docs/plans/2026-04-19-browser-control-cli-design.md`
- Created: `docs/plans/2026-04-19-browser-control-cli-plan.md`

**Step 1:** `git add docs/plans/2026-04-19-browser-control-cli-*.md`
**Step 2:** Commit:
```
git commit -m "docs: add browser-control-cli rewrite design and plan

Design drops MCP layer, replaces localhost WebSocket with Unix domain
socket, keeps the Firefox extension and native-messaging host. CLI is
one-shot, JSON-only, six verbs for v1.
"
```

---

## Phase 1 — Tear out the MCP layer

One commit per distinct teardown, so each can be reverted or bisected in isolation.

### Task 1.1: Delete `mcp-server/` package

**Step 1:** `git rm -r mcp-server/`
**Step 2:** Remove `"mcp-server"` from root `package.json` workspaces / nx config.
**Step 3:** `npm install` to re-lock.
**Step 4:** `npm run build` — expect it to succeed (extension alone still builds).
**Step 5:** Commit: `chore: remove mcp-server package`.

### Task 1.2: Delete DXT tooling and Docker

**Files:**
- Delete: `Dockerfile`
- Delete: any `.dxt`-related scripts remaining in root

**Step 1:** `git rm Dockerfile`
**Step 2:** Search for dxt references: `grep -r dxt --include='*.json' --include='*.md' --include='*.ts' .` — remove any that remain.
**Step 3:** Commit: `chore: remove DXT and Docker build targets`.

### Task 1.3: Delete HMAC auth and in-extension WebSocket server

**Files:**
- Delete: `firefox-extension/auth.ts`
- Delete: `firefox-extension/websocket-server.ts`
- Modify: `firefox-extension/background.ts` (leave a TODO stub that will be replaced in phase 3)

**Step 1:** `git rm firefox-extension/auth.ts firefox-extension/websocket-server.ts`
**Step 2:** Edit `background.ts` to remove all references; leave the file with just `initExtension()` returning the config (no server start).
**Step 3:** Delete `firefox-extension/__tests__/` entries that covered auth/websocket.
**Step 4:** `cd firefox-extension && npm run build` — expect success.
**Step 5:** Commit: `chore: remove HMAC auth and in-extension WebSocket server`.

---

## Phase 2 — New scaffolding (one commit)

### Task 2.1: Rename `firefox-extension/` → `extension/`

**Step 1:** `git mv firefox-extension extension`
**Step 2:** Update all path references in root `package.json`, `tsconfig.*`, and docs.
**Step 3:** `npm install && npm run build` — expect success.
**Step 4:** Commit: `refactor: rename firefox-extension/ to extension/`.

### Task 2.2: Replace Nx with plain npm workspaces

**Files:**
- Delete: `nx.json`, `.nx/`, `pnpm-workspace.yaml`, any `nx.json` inside subpackages
- Modify: root `package.json` — add `"workspaces": ["common", "extension", "native-host"]`. (No `cli/` yet.)

**Step 1:** `git rm -r nx.json .nx pnpm-workspace.yaml`
**Step 2:** Edit root `package.json`:
  - add `"workspaces": ["common", "extension", "native-host"]`
  - replace `"build": "nx run-many ..."` with `"build": "npm run build --workspaces --if-present"`
**Step 3:** `rm package-lock.json && npm install`
**Step 4:** `npm run build` — expect success.
**Step 5:** Commit: `build: replace Nx with npm workspaces`.

### Task 2.3: Add shared protocol types in `common/`

**Files:**
- Modify: `common/server-messages.ts` → keep only the 6 v1 verbs; delete `reorder-tabs`, `group-tabs`, `find-highlight`.
- Modify: `common/extension-messages.ts` → matching trim.
- Create: `common/protocol.ts` — new CLI↔host wire envelope (reuses the existing types).

**Step 1:** Write failing test: `common/__tests__/protocol.test.ts` — imports `Request`, `Response`, `ErrorResponse` from `./protocol`.
**Step 2:** Run test: expected FAIL (module not found).
**Step 3:** Implement `common/protocol.ts`:
```ts
import type { ServerMessage } from "./server-messages";
import type { ExtensionMessage } from "./extension-messages";

export type Request = ServerMessage & { correlationId: string };
export type Response = ExtensionMessage;
export type ErrorResponse = { correlationId: string; error: string };
export type SocketEnvelope = Response | ErrorResponse;
```
**Step 4:** Run test: expected PASS.
**Step 5:** Trim `server-messages.ts` and `extension-messages.ts` to remove dropped verbs.
**Step 6:** Commit: `feat(common): add CLI/host/extension protocol types, drop v1-cut verbs`.

---

## Phase 3 — Native host rewrite

### Task 3.1: Rewrite `native-host/src/host.ts` around a Unix socket

**Files:**
- Modify: `native-host/src/host.ts` (replace existing WebSocket-server body)
- Modify: `native-host/package.json` (drop `ws` dep, keep `@browser-control-mcp/common` or rename to `@browser-control/common`)
- Create: `native-host/src/__tests__/multiplex.test.ts`

**Step 1:** Write failing test: spawn a host subprocess with a mocked stdin/stdout, connect two Unix-socket clients, send two requests with different `correlationId`s, assert each client gets its own reply.
**Step 2:** Run test: expected FAIL.
**Step 3:** Implement:
  - Open UDS at `$XDG_RUNTIME_DIR/browser-control-cli.sock` (fallbacks as in design).
  - `chmod 0600` after bind; unlink on exit; unlink stale socket on start (probe first).
  - On each UDS connection: read one line (or EOF), parse JSON request, store `{correlationId → socket}`, forward request to stdout as a native-messaging frame.
  - On each stdin frame: parse, look up socket by `correlationId`, write envelope to that socket, close it, delete map entry.
  - On stdin EOF: close all sockets, unlink socket file, exit 0.
  - 30s per-request timeout with `{error: "timeout"}` reply.
**Step 4:** Run test: expected PASS.
**Step 5:** Commit: `feat(native-host): rewrite as UDS↔native-messaging bridge`.

### Task 3.2: Add `install` and `uninstall` subcommands to the host binary

**Files:**
- Modify: `native-host/src/host.ts` — `if (argv[2] === 'install') { writeManifest(); exit } else if ... else { runBridge() }`
- Modify: `native-host/browser_control_mcp_host.json` → rename to `browser_control_cli_host.json`

**Step 1:** Write failing test: `install` writes the manifest to a temp dir, `uninstall` removes it.
**Step 2:** Implement install/uninstall (platform-aware path lookup).
**Step 3:** Run tests.
**Step 4:** Commit: `feat(native-host): add install/uninstall subcommands for manifest`.

---

## Phase 4 — Extension rewiring (single commit, no behavior change per verb)

### Task 4.1: Replace `websocket-server.ts` role with a simple native-bridge

The extension no longer needs to speak WebSocket to anyone. Its only job is
to relay native-messaging frames to/from `MessageHandler`.

**Files:**
- Create: `extension/native-bridge.ts` — `connectNative("browser_control_cli_host")`, pipe messages to/from `MessageHandler`.
- Modify: `extension/background.ts` — wire `MessageHandler` directly to the native port.
- Modify: `extension/manifest.json` — update extension id/name if we're rebranding now (optional; can stay as-is and rename at merge).

**Step 1:** Write a Jest test that constructs `MessageHandler` with a mock `ResponseSender`, sends a `get-tab-list` request, asserts it calls `browser.tabs.query`.
**Step 2:** Implement `native-bridge.ts`:
```ts
const port = browser.runtime.connectNative("browser_control_cli_host");
const handler = new MessageHandler({
  async sendResourceToServer(resource) { port.postMessage(resource); },
  async sendErrorToServer(correlationId, errorMessage) { port.postMessage({correlationId, error: errorMessage}); },
});
port.onMessage.addListener((msg) => handler.handleDecodedMessage(msg));
```
**Step 3:** Wire into `background.ts` (replaces the old `initServer`).
**Step 4:** `cd extension && npm run build && npm test`
**Step 5:** Commit: `refactor(extension): connect MessageHandler directly to native messaging port`.

### Task 4.2: Remove dropped verbs from `message-handler.ts`

**Files:**
- Modify: `extension/message-handler.ts` — delete `reorder-tabs`, `group-tabs`, `find-highlight` cases and their private methods.
- Modify: `extension/extension-config.ts` — drop the dropped tools from `COMMAND_TO_TOOL_ID`, any tool-enable defaults.
- Modify: `extension/__tests__/*` — delete tests for dropped verbs.

**Commits:** one per verb removed. Three commits:
- `chore(extension): remove find-highlight operation`
- `chore(extension): remove group-tabs operation`
- `chore(extension): remove reorder-tabs operation`

---

## Phase 5 — CLI package

### Task 5.1: Scaffold `cli/` package

**Files:**
- Create: `cli/package.json` — `"bin": {"browser-control-cli": "./dist/main.js"}`, dependencies: `commander` (or `cac`).
- Create: `cli/tsconfig.json`
- Create: `cli/src/main.ts` — empty commander program.
- Create: `cli/src/client.ts` — UDS connect, send, recv.
- Modify: root `package.json` workspaces — add `"cli"`.

**Step 1:** Write failing test in `cli/src/__tests__/client.test.ts`: mock a UDS server that echoes, call `sendRequest({cmd: "get-tab-list"})`, assert response shape.
**Step 2:** Run: FAIL.
**Step 3:** Implement `client.ts`:
  - Resolve socket path (same logic as host).
  - `net.createConnection` → write `JSON.stringify(req) + "\n"` → collect until end → parse.
  - Throw typed error if file missing ("is Firefox running with the extension installed?").
**Step 4:** Run: PASS.
**Step 5:** Commit: `feat(cli): scaffold CLI package and UDS client`.

### Task 5.2: Wire up the help/usage framework

Just the root command that lists subcommands; no verbs yet.

**Step 1:** `commander` program with `--version`, `--help`, no subcommands.
**Step 2:** Smoke test: `node cli/dist/main.js --help` prints usage and exits 0.
**Step 3:** Commit: `feat(cli): add program entrypoint and help`.

### Task 5.3 — 5.8: Add one verb per commit

Implement in this order so we can test end-to-end as early as possible:

**5.3** `feat(cli): add list-tabs` — `cli/src/commands/list-tabs.ts`. Test hits a fake UDS server. Then end-to-end test: run `npm run build` across workspaces, load the extension, run the CLI, expect `{resource: "tabs", tabs: [...]}`.

**5.4** `feat(cli): add current-tab` — same shape.

**5.5** `feat(cli): add open-tab` — takes `<url>` positional arg, URL must start with `https://` (mirrors extension validation).

**5.6** `feat(cli): add close-tabs` — takes `<ids...>` (variadic).

**5.7** `feat(cli): add get-content` — takes `<id>`, optional `--offset <n>`. Note: requires origin permission in the browser; document the UX (a tab pops up asking for permission).

**5.8** `feat(cli): add history-search` — optional `[query]`.

Each task:
1. Write failing unit test against a fake UDS server.
2. Implement command.
3. Run unit test.
4. Manual end-to-end test with a running Firefox + extension.
5. Commit.

---

## Phase 6 — Install flow and docs

### Task 6.1: Single-binary build with Bun

**Files:**
- Modify: `cli/package.json` add `"build:binary": "bun build --compile src/main.ts --outfile dist/browser-control-cli"`

**Step 1:** `cd cli && npm run build:binary`
**Step 2:** `./dist/browser-control-cli --help` works standalone.
**Step 3:** Commit: `build(cli): bun compile to single binary`.

### Task 6.2: `install-host` CLI subcommand

**Files:**
- Create: `cli/src/commands/install-host.ts` — invokes the host binary's own `install` subcommand (shells out) or writes the manifest directly.

**Step 1:** Write test: temp HOME, run `install-host`, assert manifest exists at expected path pointing to the correct binary.
**Step 2:** Implement.
**Step 3:** Commit: `feat(cli): add install-host subcommand`.

### Task 6.3: Rewrite README for the new flow

**Files:**
- Modify: `README.md`

**Step 1:** Document: install extension from AMO, `npm i -g browser-control-cli`, `browser-control-cli install-host`, done.
**Step 2:** Include the 6 verbs and example JSON output.
**Step 3:** Commit: `docs: rewrite README for CLI workflow`.

### Task 6.4: Archive old docs

**Files:**
- Move: `CONTRIBUTING.md` — update or keep as-is.
- Delete: references to MCP / Claude Desktop / DXT from `.github/`.

**Step 1:** Audit `.github/`. Commit any changes: `chore: clean up repo of MCP references`.

---

## Phase 7 — Smoke test end-to-end

### Task 7.1: Manual verification pass

Load the built extension as a Temporary Add-on, run each CLI verb, confirm expected JSON. Document any gaps in a follow-up issue list in the plan doc.

No commits expected unless issues found.

---

## Open questions (resolve during implementation)

- **Extension ID & name.** Change to `browser-control-cli@…` now, or defer until AMO re-submission? Defer is cheaper.
- **Multi-profile collision handling.** Design says "detailed behavior TBD." Pick one of: last-writer-wins, first-writer-locks, per-profile socket paths. Prefer first-writer-locks with a clear "already running" error.
- **Windows.** Excluded from v1; leave a TODO in README.

## Done when

- `npm install && npm run build` at the repo root succeeds.
- A freshly-installed user can: install extension, `npm i -g browser-control-cli`, run `browser-control-cli install-host`, start Firefox, run `browser-control-cli list-tabs` and get a JSON response.
- No reference to "MCP", "DXT", "WebSocket", or "HMAC" remains in runtime code.
- Each v1 verb has both a unit test and a manual end-to-end verification recorded.

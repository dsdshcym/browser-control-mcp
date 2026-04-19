# Manual end-to-end smoke test

Automated tests cover each layer in isolation. This runbook walks through
a live verification once the code is built.

## Prerequisites

```
git status            # on feat/cli-rewrite, clean
npm install
npm run build
```

All three `dist/` artifacts should exist:
- `extension/dist/background.js`
- `native-host/dist/host.js`
- `cli/dist/main.js`

## 1. Install the native-messaging manifest

```
node native-host/dist/host.js install
```

Expected output: `installed: ~/Library/Application Support/Mozilla/NativeMessagingHosts/browser_control_cli_host.json`
(on macOS; Linux path is `~/.mozilla/native-messaging-hosts/`).

Verify the manifest points at the built binary:
```
jq . ~/Library/Application\ Support/Mozilla/NativeMessagingHosts/browser_control_cli_host.json
```
`path` should be the absolute path to `native-host/dist/host.js` (it
follows symlinks via `realpath`).

## 2. Load the extension in Firefox

1. Open `about:debugging` → "This Firefox".
2. "Load Temporary Add-on..." → pick `extension/manifest.json`.
3. The extension should load without errors. Check the background
   console: *Inspect* next to the extension entry → Console tab.

Expected log lines:
```
Browser Control CLI extension initialized
```

If the native host is missing or the manifest is wrong you'll see:
```
native-host disconnected: No such native application browser_control_cli_host
```

## 3. Exercise each verb

From a shell, run each command and verify the JSON reply.

```
node cli/dist/main.js list-tabs | jq '.tabs | length'
node cli/dist/main.js current-tab | jq '.tab.url'
node cli/dist/main.js open-tab https://example.com | jq .
node cli/dist/main.js list-tabs | jq '.tabs[] | select(.url == "https://example.com/") | .id'
# copy the id, then:
node cli/dist/main.js close-tabs <id> | jq .
node cli/dist/main.js history-search github | jq '.historyItems | length'
```

`get-content` requires per-origin permission. First invocation on a new
domain pops up the extension's options page asking for permission:

```
node cli/dist/main.js get-content <id-of-an-open-tab>
```

If permission hasn't been granted yet the CLI returns:
```
{"error":"The user has not yet granted permission to access the domain...","hint":...}
```
Grant permission in the popped-up page, then re-run.

## 4. Expected failure modes

- **Socket not running** (extension not loaded): CLI prints
  `{"error":"socket not found at ...","hint":"Is Firefox running with the Browser Control CLI extension installed?"}`
  and exits 1.
- **Invalid URL**: `open-tab http://example.com` → CLI rejects before
  hitting the socket.
- **Tool disabled in extension options**: extension throws
  `Command 'X' is disabled in extension settings`.

## 5. Cleanup

```
node native-host/dist/host.js uninstall
```
Removes the manifest. Reload or remove the extension from `about:debugging`.

## Known limitations

- **macOS + Linux only** in v1. Windows fails at `manifestPathsFor` with
  "unsupported platform".
- **One Firefox profile at a time.** If two profiles load the extension,
  the second host fails with "already in use" (tested in
  `native-host/src/__tests__/bridge.test.ts`).
- **Unsigned bun-compiled binary on macOS** may be blocked by
  Gatekeeper / MDM. The `node cli/dist/main.js ...` invocation path
  works regardless.

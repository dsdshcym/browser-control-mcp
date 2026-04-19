# Contributing

We welcome pull requests for bug fixes, docs improvements, and new verbs.

## Development guidelines

### Testing
- Keep unit tests green: Jest (extension) and `node --test` (native-host, cli).
- Manually verify any verb end-to-end: load the extension as a Temporary Add-on, run the CLI, confirm the JSON.

### Compatibility
- Keep the wire protocol in `common/` additive — old extensions should still parse new messages.
- Firefox minimum version is declared in `extension/manifest.json`.

### Security and privacy
- Per-origin content reads require the user's browser-side permission prompt.
- The socket must remain `0600` and in a per-user directory; no network transport.
- No telemetry; no runtime third-party deps in the extension.

### Commit discipline
- One operation per commit when adding or removing CLI verbs. Shared scaffolding lands first as its own commit.
- Follow the existing commit-message style (imperative mood, one-line summary, optional body).

## Pull request process

1. Fork the repository.
2. Create a feature branch from `main`.
3. Make your changes with tests.
4. `npm run build && npm --workspaces test`.
5. Test manually in Firefox.
6. Submit a PR with a clear description.

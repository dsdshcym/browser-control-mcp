export function emitSuccess(payload: unknown): never {
  process.stdout.write(JSON.stringify(payload) + "\n");
  process.exit(0);
}

export function emitError(message: string, hint?: string): never {
  const body: { error: string; hint?: string } = { error: message };
  if (hint) body.hint = hint;
  process.stderr.write(JSON.stringify(body) + "\n");
  process.exit(1);
}

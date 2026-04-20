async function writeAndFlush(stream: NodeJS.WriteStream, data: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    stream.write(data, (err) => (err ? reject(err) : resolve()));
  });
}

export async function emitSuccess(payload: unknown): Promise<never> {
  await writeAndFlush(process.stdout, JSON.stringify(payload) + "\n");
  process.exit(0);
}

export async function emitError(message: string, hint?: string): Promise<never> {
  const body: { error: string; hint?: string } = { error: message };
  if (hint) body.hint = hint;
  await writeAndFlush(process.stderr, JSON.stringify(body) + "\n");
  process.exit(1);
}

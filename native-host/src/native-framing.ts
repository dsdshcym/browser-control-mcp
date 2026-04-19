import type { Writable } from "stream";

export type FrameHandler = (msg: unknown) => void;

export function writeNativeFrame(out: Writable, message: unknown): void {
  const json = JSON.stringify(message);
  const payload = Buffer.from(json, "utf-8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  out.write(Buffer.concat([header, payload]));
}

export class NativeFrameReader {
  private buffer: Buffer = Buffer.alloc(0);

  constructor(private readonly onMessage: FrameHandler) {}

  push(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (this.buffer.length < 4 + length) {
        return;
      }
      const payload = this.buffer.subarray(4, 4 + length);
      this.buffer = this.buffer.subarray(4 + length);
      try {
        this.onMessage(JSON.parse(payload.toString("utf-8")));
      } catch (err) {
        // A malformed frame shouldn't stop processing subsequent frames.
        // Write to stderr so Firefox logs it but continue.
        console.error("native-host: failed to parse frame", err);
      }
    }
  }
}

import type { ServerMessage } from "./server-messages";
import type { ExtensionMessage } from "./extension-messages";

export type Request = ServerMessage & { correlationId: string };

export type Response = ExtensionMessage;

export interface ErrorResponse {
  correlationId: string;
  error: string;
}

export type SocketEnvelope = Response | ErrorResponse;

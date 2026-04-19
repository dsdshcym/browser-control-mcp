import type { ExtensionMessage, ServerMessageRequest } from "@browser-control-mcp/common";
import { MessageHandler, ResponseSender } from "./message-handler";

const NATIVE_HOST_NAME = "browser_control_cli_host";

export function startNativeBridge(): void {
  const port = browser.runtime.connectNative(NATIVE_HOST_NAME);

  const sender: ResponseSender = {
    async sendResourceToServer(resource: ExtensionMessage): Promise<void> {
      port.postMessage(resource);
    },
    async sendErrorToServer(correlationId: string, errorMessage: string): Promise<void> {
      port.postMessage({ correlationId, error: errorMessage });
    },
  };

  const handler = new MessageHandler(sender);

  port.onMessage.addListener(async (raw: unknown) => {
    const req = raw as ServerMessageRequest;
    try {
      await handler.handleDecodedMessage(req);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await sender.sendErrorToServer(req.correlationId, message);
    }
  });

  port.onDisconnect.addListener(() => {
    const err = browser.runtime.lastError;
    console.error("native-host disconnected:", err?.message ?? "(no error)");
  });
}

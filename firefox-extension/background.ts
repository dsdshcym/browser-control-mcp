import { WebsocketServer } from "./websocket-server";
import { MessageHandler, ResponseSender } from "./message-handler";
import { getConfig, generateSecret } from "./extension-config";
import type { ExtensionMessage } from "@browser-control-mcp/common";

const DEFAULT_PORT = 8089;

/**
 * Creates a ResponseSender that routes responses to a specific MCP client.
 * Each MCP client connection gets its own ResponseSender instance.
 */
function createResponseSender(server: WebsocketServer, clientId: string): ResponseSender {
  return {
    async sendResourceToServer(resource: ExtensionMessage): Promise<void> {
      await server.sendResourceToClient(clientId, resource);
    },
    async sendErrorToServer(correlationId: string, errorMessage: string): Promise<void> {
      await server.sendErrorToClient(clientId, correlationId, errorMessage);
    },
  };
}

function initServer(port: number, secret: string) {
  const wsServer = new WebsocketServer(port, secret);

  wsServer.addMessageListener(async (message, clientId) => {
    console.log(`Message from MCP client ${clientId}:`, message);

    // Create a response sender for this specific client
    const responseSender = createResponseSender(wsServer, clientId);
    const messageHandler = new MessageHandler(responseSender);

    try {
      await messageHandler.handleDecodedMessage(message);
    } catch (error) {
      console.error("Error handling message:", error);
      if (error instanceof Error) {
        await responseSender.sendErrorToServer(message.correlationId, error.message);
      }
    }
  });

  wsServer.start();
}

async function initExtension() {
  let config = await getConfig();
  if (!config.secret) {
    console.log("No secret found, generating new one");
    await generateSecret();
    // Open the options page to allow the user to view the config:
    await browser.runtime.openOptionsPage();
    config = await getConfig();
  }
  return config;
}

initExtension()
  .then((config) => {
    const secret = config.secret;

    if (!secret) {
      console.error("Secret not found in storage - reinstall extension");
      return;
    }

    // In the new architecture, the extension is the server and only listens
    // on a single port. Multiple MCP clients connect to this server.
    const port = config.ports?.[0] || DEFAULT_PORT;
    initServer(port, secret);

    console.log(`Browser extension initialized - WebSocket server on port ${port}`);
  })
  .catch((error) => {
    console.error("Error initializing extension:", error);
  });

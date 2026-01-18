import type {
  ExtensionMessage,
  ExtensionError,
  ServerMessageRequest,
} from "@browser-control-mcp/common";
import { getMessageSignature } from "./auth";

// Message types for native messaging communication
interface NativeClientConnected {
  type: "client-connected";
  clientId: string;
}

interface NativeClientDisconnected {
  type: "client-disconnected";
  clientId: string;
}

interface NativeClientMessage {
  type: "client-message";
  clientId: string;
  data: string;
}

interface NativeServerStarted {
  type: "server-started";
  port: number;
}

interface NativeServerError {
  type: "server-error";
  error: string;
}

type NativeMessage =
  | NativeClientConnected
  | NativeClientDisconnected
  | NativeClientMessage
  | NativeServerStarted
  | NativeServerError;

/**
 * WebSocket server bridge that uses native messaging to provide WebSocket
 * server functionality. Firefox extensions cannot directly create WebSocket
 * servers, so we use a native messaging host (Node.js process) to provide
 * this capability.
 *
 * Architecture:
 * - Extension spawns native messaging host via browser.runtime.connectNative()
 * - Native host creates WebSocket server on specified port
 * - MCP server instances connect to this WebSocket server as clients
 * - Native host relays messages between extension and MCP clients
 *
 * This allows multiple Claude Code instances to share a single browser extension.
 */
export class WebsocketServer {
  private nativePort: browser.runtime.Port | null = null;
  private connectedClients: Set<string> = new Set();
  private readonly port: number;
  private readonly secret: string;
  private messageCallback: ((data: ServerMessageRequest, clientId: string) => void) | null = null;
  private isStarted: boolean = false;

  constructor(port: number, secret: string) {
    this.port = port;
    this.secret = secret;
  }

  /**
   * Start the WebSocket server via native messaging host.
   */
  public start(): void {
    if (this.isStarted) {
      console.log("WebSocket server already started");
      return;
    }

    console.log(`Starting WebSocket server bridge on port ${this.port}`);

    try {
      // Connect to native messaging host
      this.nativePort = browser.runtime.connectNative("browser_control_mcp_host");

      this.nativePort.onMessage.addListener((message: NativeMessage) => {
        this.handleNativeMessage(message);
      });

      this.nativePort.onDisconnect.addListener(() => {
        const error = browser.runtime.lastError;
        if (error) {
          console.error("Native messaging host disconnected with error:", error.message);
        } else {
          console.log("Native messaging host disconnected");
        }
        this.isStarted = false;
        this.connectedClients.clear();
      });

      // Tell the native host to start the WebSocket server
      this.nativePort.postMessage({
        action: "start-server",
        port: this.port,
        secret: this.secret,
      });

      this.isStarted = true;
      console.log("WebSocket server bridge initialized");
    } catch (error) {
      console.error("Failed to connect to native messaging host:", error);
      console.error(
        "Make sure the native messaging host is installed. " +
        "See the README for installation instructions."
      );
    }
  }

  /**
   * Handle messages from the native messaging host.
   */
  private handleNativeMessage(message: NativeMessage): void {
    switch (message.type) {
      case "server-started":
        console.log(`WebSocket server started on port ${message.port}`);
        break;

      case "server-error":
        console.error(`WebSocket server error: ${message.error}`);
        break;

      case "client-connected":
        console.log(`MCP client connected: ${message.clientId}`);
        this.connectedClients.add(message.clientId);
        break;

      case "client-disconnected":
        console.log(`MCP client disconnected: ${message.clientId}`);
        this.connectedClients.delete(message.clientId);
        break;

      case "client-message":
        this.handleClientMessage(message.clientId, message.data);
        break;
    }
  }

  public addMessageListener(
    callback: (data: ServerMessageRequest, clientId: string) => void
  ): void {
    this.messageCallback = callback;
  }

  /**
   * Handle incoming messages from MCP clients (via native messaging)
   */
  private async handleClientMessage(clientId: string, data: string): Promise<void> {
    if (this.messageCallback === null) {
      return;
    }

    try {
      const signedMessage = JSON.parse(data);
      const messageSig = await getMessageSignature(
        JSON.stringify(signedMessage.payload),
        this.secret
      );

      if (messageSig.length === 0 || messageSig !== signedMessage.signature) {
        console.error(`Invalid message signature from client ${clientId}`);
        await this.sendErrorToClient(
          clientId,
          signedMessage.payload.correlationId,
          "Invalid message signature - extension and server not in sync"
        );
        return;
      }

      this.messageCallback(signedMessage.payload, clientId);
    } catch (error) {
      console.error(`Failed to parse message from client ${clientId}:`, error);
    }
  }

  public async sendResourceToClient(clientId: string, resource: ExtensionMessage): Promise<void> {
    if (!this.nativePort) {
      console.error("Native messaging port not connected");
      return;
    }

    if (!this.connectedClients.has(clientId)) {
      console.error(`Client ${clientId} is not connected`);
      return;
    }

    const signedMessage = {
      payload: resource,
      signature: await getMessageSignature(
        JSON.stringify(resource),
        this.secret
      ),
    };

    this.nativePort.postMessage({
      action: "send-to-client",
      clientId: clientId,
      data: JSON.stringify(signedMessage),
    });
  }

  public async sendErrorToClient(
    clientId: string,
    correlationId: string,
    errorMessage: string
  ): Promise<void> {
    if (!this.nativePort) {
      console.error("Native messaging port not connected");
      return;
    }

    if (!this.connectedClients.has(clientId)) {
      console.error(`Client ${clientId} is not connected`);
      return;
    }

    const extensionError: ExtensionError = {
      correlationId,
      errorMessage: errorMessage,
    };

    this.nativePort.postMessage({
      action: "send-to-client",
      clientId: clientId,
      data: JSON.stringify(extensionError),
    });
  }

  public stop(): void {
    if (this.nativePort) {
      this.nativePort.postMessage({ action: "stop-server" });
      this.nativePort.disconnect();
      this.nativePort = null;
    }
    this.connectedClients.clear();
    this.isStarted = false;
    console.log("WebSocket server bridge stopped");
  }

  public getConnectedClientCount(): number {
    return this.connectedClients.size;
  }

  public isRunning(): boolean {
    return this.isStarted;
  }
}

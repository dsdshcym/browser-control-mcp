#!/usr/bin/env node

/**
 * Native messaging host for Browser Control MCP extension.
 *
 * This process provides WebSocket server functionality for the browser extension,
 * which cannot create WebSocket servers directly due to WebExtension API limitations.
 *
 * Communication protocol:
 * - Extension communicates via stdin/stdout using native messaging protocol
 * - MCP servers connect via WebSocket
 * - This host routes messages between them
 *
 * Native messaging protocol:
 * - Messages are prefixed with 4-byte little-endian length
 * - Messages are JSON encoded
 */

import WebSocket, { WebSocketServer } from "ws";

// Message types from extension
interface StartServerAction {
  action: "start-server";
  port: number;
  secret: string;
}

interface SendToClientAction {
  action: "send-to-client";
  clientId: string;
  data: string;
}

interface StopServerAction {
  action: "stop-server";
}

type ExtensionAction = StartServerAction | SendToClientAction | StopServerAction;

// Message types to extension
interface ClientConnectedMessage {
  type: "client-connected";
  clientId: string;
}

interface ClientDisconnectedMessage {
  type: "client-disconnected";
  clientId: string;
}

interface ClientMessage {
  type: "client-message";
  clientId: string;
  data: string;
}

interface ServerStartedMessage {
  type: "server-started";
  port: number;
}

interface ServerErrorMessage {
  type: "server-error";
  error: string;
}

type HostMessage =
  | ClientConnectedMessage
  | ClientDisconnectedMessage
  | ClientMessage
  | ServerStartedMessage
  | ServerErrorMessage;

class NativeMessagingHost {
  private wsServer: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();
  private nextClientId: number = 1;
  private inputBuffer: Buffer = Buffer.alloc(0);

  constructor() {
    this.setupStdinHandler();
  }

  /**
   * Set up handler for native messaging input from the extension.
   */
  private setupStdinHandler(): void {
    process.stdin.on("data", (chunk: Buffer) => {
      this.inputBuffer = Buffer.concat([this.inputBuffer, chunk]);
      this.processInputBuffer();
    });

    process.stdin.on("end", () => {
      this.cleanup();
      process.exit(0);
    });
  }

  /**
   * Process the input buffer for complete messages.
   * Native messaging format: 4-byte little-endian length + JSON message
   */
  private processInputBuffer(): void {
    while (this.inputBuffer.length >= 4) {
      const messageLength = this.inputBuffer.readUInt32LE(0);

      if (this.inputBuffer.length < 4 + messageLength) {
        // Not enough data yet
        break;
      }

      const messageJson = this.inputBuffer.slice(4, 4 + messageLength).toString("utf-8");
      this.inputBuffer = this.inputBuffer.slice(4 + messageLength);

      try {
        const message = JSON.parse(messageJson) as ExtensionAction;
        this.handleExtensionMessage(message);
      } catch (error) {
        this.sendToExtension({
          type: "server-error",
          error: `Failed to parse message: ${error}`,
        });
      }
    }
  }

  /**
   * Handle a message from the extension.
   */
  private handleExtensionMessage(message: ExtensionAction): void {
    switch (message.action) {
      case "start-server":
        this.startServer(message.port);
        break;

      case "send-to-client":
        this.sendToClient(message.clientId, message.data);
        break;

      case "stop-server":
        this.stopServer();
        break;
    }
  }

  /**
   * Start the WebSocket server on the specified port.
   */
  private startServer(port: number): void {
    if (this.wsServer) {
      this.sendToExtension({
        type: "server-error",
        error: "Server already running",
      });
      return;
    }

    try {
      this.wsServer = new WebSocketServer({
        host: "localhost",
        port: port,
      });

      this.wsServer.on("listening", () => {
        this.sendToExtension({
          type: "server-started",
          port: port,
        });
      });

      this.wsServer.on("connection", (ws: WebSocket) => {
        const clientId = `client-${this.nextClientId++}`;
        this.clients.set(clientId, ws);

        this.sendToExtension({
          type: "client-connected",
          clientId: clientId,
        });

        ws.on("message", (data: Buffer) => {
          this.sendToExtension({
            type: "client-message",
            clientId: clientId,
            data: data.toString("utf-8"),
          });
        });

        ws.on("close", () => {
          this.clients.delete(clientId);
          this.sendToExtension({
            type: "client-disconnected",
            clientId: clientId,
          });
        });

        ws.on("error", (error) => {
          // Log but don't crash - the close event will handle cleanup
          this.sendToExtension({
            type: "server-error",
            error: `Client ${clientId} error: ${error.message}`,
          });
        });
      });

      this.wsServer.on("error", (error: Error) => {
        this.sendToExtension({
          type: "server-error",
          error: error.message,
        });
      });
    } catch (error) {
      this.sendToExtension({
        type: "server-error",
        error: `Failed to start server: ${error}`,
      });
    }
  }

  /**
   * Send a message to a specific MCP client.
   */
  private sendToClient(clientId: string, data: string): void {
    const client = this.clients.get(clientId);
    if (client && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }

  /**
   * Stop the WebSocket server.
   */
  private stopServer(): void {
    if (this.wsServer) {
      // Close all client connections
      for (const [, client] of this.clients) {
        client.close();
      }
      this.clients.clear();

      this.wsServer.close();
      this.wsServer = null;
    }
  }

  /**
   * Send a message to the extension via stdout.
   * Native messaging format: 4-byte little-endian length + JSON message
   */
  private sendToExtension(message: HostMessage): void {
    const messageJson = JSON.stringify(message);
    const messageBuffer = Buffer.from(messageJson, "utf-8");
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(messageBuffer.length, 0);

    process.stdout.write(Buffer.concat([lengthBuffer, messageBuffer]));
  }

  /**
   * Clean up resources.
   */
  private cleanup(): void {
    this.stopServer();
  }
}

// Start the host
new NativeMessagingHost();

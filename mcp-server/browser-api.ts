import WebSocket from "ws";
import type {
  ExtensionMessage,
  BrowserTab,
  BrowserHistoryItem,
  ServerMessage,
  TabContentExtensionMessage,
  ServerMessageRequest,
  ExtensionError,
} from "@browser-control-mcp/common";
import * as crypto from "crypto";

const WS_DEFAULT_PORT = 8089;
const EXTENSION_RESPONSE_TIMEOUT_MS = 1000;
const RECONNECT_INTERVAL_MS = 2000;
const MAX_RECONNECT_ATTEMPTS = 5;

interface ExtensionRequestResolver<T extends ExtensionMessage["resource"]> {
  resource: T;
  resolve: (value: Extract<ExtensionMessage, { resource: T }>) => void;
  reject: (reason?: string) => void;
}

/**
 * BrowserAPI client that connects to the browser extension's WebSocket server.
 *
 * In this architecture:
 * - The browser extension runs a WebSocket server (via native messaging host)
 * - Multiple MCP server instances can connect as clients
 * - Each MCP instance has its own connection and receives only its responses
 */
export class BrowserAPI {
  private ws: WebSocket | null = null;
  private sharedSecret: string | null = null;
  private port: number = WS_DEFAULT_PORT;
  private reconnectAttempts: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;
  private isClosing: boolean = false;

  // Map to persist the request to the extension. It maps the request correlationId
  // to a resolver, fulfilling a promise created when sending a message to the extension.
  private extensionRequestMap: Map<
    string,
    ExtensionRequestResolver<ExtensionMessage["resource"]>
  > = new Map();

  async init() {
    const { secret, port } = readConfig();
    if (!secret) {
      throw new Error(
        "EXTENSION_SECRET env var missing. See the extension's options page."
      );
    }
    this.sharedSecret = secret;
    this.port = port;

    await this.connect();
  }

  private async connect(): Promise<void> {
    if (this.isConnecting || this.isClosing) {
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      // Unless running in a container, connect to localhost
      const host = process.env.CONTAINERIZED ? "0.0.0.0" : "localhost";
      const url = `ws://${host}:${this.port}`;

      console.error(`Connecting to browser extension WebSocket server at ${url}`);

      this.ws = new WebSocket(url);

      this.ws.on("open", () => {
        console.error(`Connected to browser extension on port ${this.port}`);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (message) => {
        const decoded = JSON.parse(message.toString());
        if (isErrorMessage(decoded)) {
          this.handleExtensionError(decoded);
          return;
        }
        const signature = this.createSignature(JSON.stringify(decoded.payload));
        if (signature !== decoded.signature) {
          console.error("Invalid message signature");
          return;
        }
        this.handleDecodedExtensionMessage(decoded.payload);
      });

      this.ws.on("close", () => {
        console.error("WebSocket connection closed");
        this.isConnecting = false;
        this.ws = null;

        if (!this.isClosing) {
          this.scheduleReconnect();
        }
      });

      this.ws.on("error", (error) => {
        console.error("WebSocket error:", error.message);
        this.isConnecting = false;

        // If we haven't connected yet, reject the init promise
        if (this.reconnectAttempts === 0) {
          reject(new Error(`Failed to connect to browser extension: ${error.message}`));
        }
      });
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isClosing) {
      return;
    }

    this.reconnectAttempts++;

    if (this.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. ` +
        "Make sure the browser extension is running."
      );
      return;
    }

    console.error(
      `Scheduling reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} ` +
      `in ${RECONNECT_INTERVAL_MS}ms`
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        console.error("Reconnect failed:", error.message);
      });
    }, RECONNECT_INTERVAL_MS);
  }

  close() {
    this.isClosing = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  getConnectedPort(): number | undefined {
    return this.ws?.readyState === WebSocket.OPEN ? this.port : undefined;
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  async openTab(url: string): Promise<number | undefined> {
    const correlationId = this.sendMessageToExtension({
      cmd: "open-tab",
      url,
    });
    const message = await this.waitForResponse(correlationId, "opened-tab-id");
    return message.tabId;
  }

  async closeTabs(tabIds: number[]) {
    const correlationId = this.sendMessageToExtension({
      cmd: "close-tabs",
      tabIds,
    });
    await this.waitForResponse(correlationId, "tabs-closed");
  }

  async getTabList(): Promise<BrowserTab[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-list",
    });
    const message = await this.waitForResponse(correlationId, "tabs");
    return message.tabs;
  }

  async getBrowserRecentHistory(
    searchQuery?: string
  ): Promise<BrowserHistoryItem[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-browser-recent-history",
      searchQuery,
    });
    const message = await this.waitForResponse(correlationId, "history");
    return message.historyItems;
  }

  async getTabContent(
    tabId: number,
    offset: number
  ): Promise<TabContentExtensionMessage> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-tab-content",
      tabId,
      offset,
    });
    return await this.waitForResponse(correlationId, "tab-content");
  }

  async reorderTabs(tabOrder: number[]): Promise<number[]> {
    const correlationId = this.sendMessageToExtension({
      cmd: "reorder-tabs",
      tabOrder,
    });
    const message = await this.waitForResponse(correlationId, "tabs-reordered");
    return message.tabOrder;
  }

  async findHighlight(tabId: number, queryPhrase: string): Promise<number> {
    const correlationId = this.sendMessageToExtension({
      cmd: "find-highlight",
      tabId,
      queryPhrase,
    });
    const message = await this.waitForResponse(
      correlationId,
      "find-highlight-result"
    );
    return message.noOfResults;
  }

  async groupTabs(
    tabIds: number[],
    isCollapsed: boolean,
    groupColor: string,
    groupTitle: string
  ): Promise<number> {
    const correlationId = this.sendMessageToExtension({
      cmd: "group-tabs",
      tabIds,
      isCollapsed,
      groupColor,
      groupTitle,
    });
    const message = await this.waitForResponse(correlationId, "new-tab-group");
    return message.groupId;
  }

  async getCurrentTab(): Promise<BrowserTab> {
    const correlationId = this.sendMessageToExtension({
      cmd: "get-current-tab",
    });
    const message = await this.waitForResponse(correlationId, "current-tab");
    return message.tab;
  }

  private createSignature(payload: string): string {
    if (!this.sharedSecret) {
      throw new Error("Shared secret not initialized");
    }
    const hmac = crypto.createHmac("sha256", this.sharedSecret);
    hmac.update(payload);
    return hmac.digest("hex");
  }

  private sendMessageToExtension(message: ServerMessage): string {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(
        "WebSocket is not connected. Make sure the browser extension is running."
      );
    }

    const correlationId = Math.random().toString(36).substring(2);
    const req: ServerMessageRequest = { ...message, correlationId };
    const payload = JSON.stringify(req);
    const signature = this.createSignature(payload);
    const signedMessage = {
      payload: req,
      signature: signature,
    };

    // Send the signed message to the extension
    this.ws.send(JSON.stringify(signedMessage));

    return correlationId;
  }

  private handleDecodedExtensionMessage(decoded: ExtensionMessage) {
    const { correlationId } = decoded;
    const resolver = this.extensionRequestMap.get(correlationId);
    if (!resolver) {
      console.error("No resolver found for correlationId:", correlationId);
      return;
    }
    const { resolve, resource } = resolver;
    if (resource !== decoded.resource) {
      console.error("Resource mismatch:", resource, decoded.resource);
      return;
    }
    this.extensionRequestMap.delete(correlationId);
    resolve(decoded);
  }

  private handleExtensionError(decoded: ExtensionError) {
    const { correlationId, errorMessage } = decoded;
    const resolver = this.extensionRequestMap.get(correlationId);
    if (!resolver) {
      console.error("No resolver found for correlationId:", correlationId);
      return;
    }
    const { reject } = resolver;
    this.extensionRequestMap.delete(correlationId);
    reject(errorMessage);
  }

  private async waitForResponse<T extends ExtensionMessage["resource"]>(
    correlationId: string,
    resource: T
  ): Promise<Extract<ExtensionMessage, { resource: T }>> {
    return new Promise<Extract<ExtensionMessage, { resource: T }>>(
      (resolve, reject) => {
        this.extensionRequestMap.set(correlationId, {
          resolve: resolve as (value: ExtensionMessage) => void,
          resource,
          reject,
        });
        setTimeout(() => {
          this.extensionRequestMap.delete(correlationId);
          reject("Timed out waiting for response");
        }, EXTENSION_RESPONSE_TIMEOUT_MS);
      }
    );
  }
}

function readConfig() {
  return {
    secret: process.env.EXTENSION_SECRET,
    port: process.env.EXTENSION_PORT
      ? parseInt(process.env.EXTENSION_PORT, 10)
      : WS_DEFAULT_PORT,
  };
}

export function isErrorMessage(message: any): message is ExtensionError {
  return (
    message.errorMessage !== undefined && message.correlationId !== undefined
  );
}

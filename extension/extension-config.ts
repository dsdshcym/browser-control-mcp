/**
 * Configuration management for Browser Control CLI extension.
 */

import { ServerMessageRequest } from "@browser-control-mcp/common/server-messages";

const AUDIT_LOG_SIZE_LIMIT = 100;

export interface ToolInfo {
  id: string;
  name: string;
  description: string;
}

export const AVAILABLE_TOOLS: ToolInfo[] = [
  {
    id: "open-browser-tab",
    name: "Open Browser Tab",
    description: "Allows the CLI to open new browser tabs",
  },
  {
    id: "close-browser-tabs",
    name: "Close Browser Tabs",
    description: "Allows the CLI to close browser tabs",
  },
  {
    id: "get-list-of-open-tabs",
    name: "Get List of Open Tabs",
    description: "Allows the CLI to get a list of all open tabs",
  },
  {
    id: "get-current-tab",
    name: "Get Current Tab",
    description: "Allows the CLI to read the active tab's URL and title",
  },
  {
    id: "get-recent-browser-history",
    name: "Get Recent Browser History",
    description: "Allows the CLI to access your recent browsing history",
  },
  {
    id: "get-tab-web-content",
    name: "Get Tab Web Content",
    description: "Allows the CLI to read the content of web pages",
  },
];

export const COMMAND_TO_TOOL_ID: Record<ServerMessageRequest["cmd"], string> = {
  "open-tab": "open-browser-tab",
  "close-tabs": "close-browser-tabs",
  "get-tab-list": "get-list-of-open-tabs",
  "get-current-tab": "get-current-tab",
  "get-browser-recent-history": "get-recent-browser-history",
  "get-tab-content": "get-tab-web-content",
};

export interface ToolSettings {
  [toolId: string]: boolean;
}

export interface AuditLogEntry {
  toolId: string;
  command: string;
  timestamp: number;
  url?: string;
}

export interface ExtensionConfig {
  toolSettings?: ToolSettings;
  domainDenyList?: string[];
  auditLog?: AuditLogEntry[];
}

export function getDefaultToolSettings(): ToolSettings {
  const settings: ToolSettings = {};
  AVAILABLE_TOOLS.forEach((tool) => {
    settings[tool.id] = true;
  });
  return settings;
}

export async function getConfig(): Promise<ExtensionConfig> {
  const configObj = await browser.storage.local.get("config");
  const config: ExtensionConfig = configObj.config || {};
  if (!config.toolSettings) {
    config.toolSettings = getDefaultToolSettings();
  }
  return config;
}

export async function saveConfig(config: ExtensionConfig): Promise<void> {
  await browser.storage.local.set({ config });
}

export async function isToolEnabled(toolId: string): Promise<boolean> {
  const config = await getConfig();
  return config.toolSettings?.[toolId] !== false;
}

export async function isCommandAllowed(command: ServerMessageRequest["cmd"]): Promise<boolean> {
  const toolId = COMMAND_TO_TOOL_ID[command];
  if (!toolId) {
    console.error(`Unknown command: ${command}`);
    return false;
  }
  return isToolEnabled(toolId);
}

export async function setToolEnabled(toolId: string, enabled: boolean): Promise<void> {
  const config = await getConfig();
  if (!config.toolSettings) {
    config.toolSettings = getDefaultToolSettings();
  }
  config.toolSettings[toolId] = enabled;
  await saveConfig(config);
}

export async function getAllToolSettings(): Promise<ToolSettings> {
  const config = await getConfig();
  return config.toolSettings || getDefaultToolSettings();
}

export async function getDomainDenyList(): Promise<string[]> {
  const config = await getConfig();
  return config.domainDenyList || [];
}

export async function setDomainDenyList(domains: string[]): Promise<void> {
  const config = await getConfig();
  config.domainDenyList = domains;
  await saveConfig(config);
}

export async function isDomainInDenyList(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname;
    const denyList = await getDomainDenyList();
    return denyList.some((deniedDomain) =>
      domain.toLowerCase() === deniedDomain.toLowerCase() ||
      domain.toLowerCase().endsWith(`.${deniedDomain.toLowerCase()}`)
    );
  } catch (error) {
    console.error(`Error checking domain in deny list: ${error}`);
    return false;
  }
}

export async function addAuditLogEntry(entry: AuditLogEntry): Promise<void> {
  const config = await getConfig();
  if (!config.auditLog) config.auditLog = [];
  config.auditLog.unshift(entry);
  if (config.auditLog.length > AUDIT_LOG_SIZE_LIMIT) {
    config.auditLog = config.auditLog.slice(0, AUDIT_LOG_SIZE_LIMIT);
  }
  await saveConfig(config);
}

export async function getAuditLog(): Promise<AuditLogEntry[]> {
  const config = await getConfig();
  return config.auditLog || [];
}

export async function clearAuditLog(): Promise<void> {
  const config = await getConfig();
  config.auditLog = [];
  await saveConfig(config);
}

export function getToolNameById(toolId: string): string {
  const tool = AVAILABLE_TOOLS.find((t) => t.id === toolId);
  return tool ? tool.name : toolId;
}

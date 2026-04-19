/**
 * Options page script for Browser Control CLI extension.
 */
import {
  AVAILABLE_TOOLS,
  getAllToolSettings,
  setToolEnabled,
  getDomainDenyList,
  setDomainDenyList,
  getAuditLog,
  clearAuditLog,
  getToolNameById,
} from "./extension-config";

const ALL_SITES_ORIGINS = ["*://*/*"];

const toolSettingsContainer = document.getElementById("tool-settings-container") as HTMLDivElement;
const grantAllSitesButton = document.getElementById("grant-all-sites") as HTMLButtonElement | null;
const revokeAllSitesButton = document.getElementById("revoke-all-sites") as HTMLButtonElement | null;
const allSitesStatusElement = document.getElementById("all-sites-status") as HTMLParagraphElement | null;
const allSitesFeedbackElement = document.getElementById("all-sites-feedback") as HTMLDivElement | null;
const domainDenyListTextarea = document.getElementById("domain-deny-list") as HTMLTextAreaElement;
const saveDomainListsButton = document.getElementById("save-domain-lists") as HTMLButtonElement;
const domainStatusElement = document.getElementById("domain-status") as HTMLDivElement;
const auditLogContainer = document.getElementById("audit-log-container") as HTMLDivElement;
const clearAuditLogButton = document.getElementById("clear-audit-log") as HTMLButtonElement;
const auditLogStatusElement = document.getElementById("audit-log-status") as HTMLDivElement;

async function createToolSettingsUI(): Promise<void> {
  const toolSettings = await getAllToolSettings();
  toolSettingsContainer.innerHTML = "";

  AVAILABLE_TOOLS.forEach((tool) => {
    const isEnabled = toolSettings[tool.id] !== false;

    const toolRow = document.createElement("div");
    toolRow.className = "tool-row";

    const labelContainer = document.createElement("div");
    labelContainer.className = "tool-label-container";

    const toolName = document.createElement("div");
    toolName.className = "tool-name";
    toolName.textContent = tool.name;

    const toolDescription = document.createElement("div");
    toolDescription.className = "tool-description";
    toolDescription.textContent = tool.description;

    labelContainer.appendChild(toolName);
    labelContainer.appendChild(toolDescription);

    const toggleContainer = document.createElement("label");
    toggleContainer.className = "toggle-switch";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isEnabled;
    checkbox.dataset.toolId = tool.id;
    checkbox.addEventListener("change", handleToolToggle);

    const slider = document.createElement("span");
    slider.className = "slider";

    toggleContainer.appendChild(checkbox);
    toggleContainer.appendChild(slider);

    toolRow.appendChild(labelContainer);
    toolRow.appendChild(toggleContainer);

    toolSettingsContainer.appendChild(toolRow);
  });
}

async function handleToolToggle(event: Event): Promise<void> {
  const checkbox = event.target as HTMLInputElement;
  const toolId = checkbox.dataset.toolId;
  if (!toolId) return;
  try {
    await setToolEnabled(toolId, checkbox.checked);
  } catch (error) {
    console.error("Error saving tool setting:", error);
    checkbox.checked = !checkbox.checked;
  }
}

async function loadDomainLists(): Promise<void> {
  try {
    const denyList = await getDomainDenyList();
    domainDenyListTextarea.value = denyList.join("\n");
  } catch (error) {
    console.error("Error loading domain lists:", error);
    domainStatusElement.textContent = "Error loading domain lists.";
    domainStatusElement.style.color = "red";
  }
}

async function saveDomainLists(event: MouseEvent): Promise<void> {
  if (!event.isTrusted) return;
  try {
    const denyListText = domainDenyListTextarea.value.trim();
    const denyList = denyListText
      ? denyListText.split("\n").map((d) => d.trim()).filter(Boolean)
      : [];
    await setDomainDenyList(denyList);
    domainStatusElement.textContent = "Domain deny list saved.";
    domainStatusElement.style.color = "#4caf50";
    setTimeout(() => { domainStatusElement.textContent = ""; domainStatusElement.style.color = ""; }, 3000);
  } catch (error) {
    console.error("Error saving domain lists:", error);
    domainStatusElement.textContent = "Failed to save domain lists.";
    domainStatusElement.style.color = "red";
  }
}

async function loadAuditLog(): Promise<void> {
  try {
    const auditLog = await getAuditLog();
    auditLogContainer.innerHTML = "";

    if (auditLog.length === 0) {
      const emptyDiv = document.createElement("div");
      emptyDiv.className = "audit-log-empty";
      emptyDiv.textContent = "No tool usage recorded yet.";
      auditLogContainer.appendChild(emptyDiv);
      return;
    }

    const table = document.createElement("table");
    table.className = "audit-log-table";

    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["Tool", "Timestamp", "Domain"].forEach((headerText) => {
      const th = document.createElement("th");
      th.textContent = headerText;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    auditLog.forEach((entry) => {
      const row = document.createElement("tr");

      const toolCell = document.createElement("td");
      toolCell.textContent = getToolNameById(entry.toolId);
      row.appendChild(toolCell);

      const timeCell = document.createElement("td");
      timeCell.textContent = new Date(entry.timestamp).toLocaleString();
      row.appendChild(timeCell);

      const urlCell = document.createElement("td");
      urlCell.textContent = entry.url ? new URL(entry.url).hostname : "-";
      row.appendChild(urlCell);

      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    auditLogContainer.appendChild(table);
  } catch (error) {
    console.error("Error loading audit log:", error);
  }
}

async function handleClearAuditLog(event: MouseEvent): Promise<void> {
  if (!event.isTrusted) return;
  try {
    await clearAuditLog();
    await loadAuditLog();
    auditLogStatusElement.textContent = "Audit log cleared.";
    auditLogStatusElement.style.color = "#4caf50";
    setTimeout(() => { auditLogStatusElement.textContent = ""; auditLogStatusElement.style.color = ""; }, 3000);
  } catch (error) {
    console.error("Error clearing audit log:", error);
    auditLogStatusElement.textContent = "Failed to clear audit log.";
    auditLogStatusElement.style.color = "red";
  }
}

function initializeCollapsibleSections(): void {
  const headers = document.querySelectorAll(".section-container > h2");
  headers.forEach((header) => {
    header.addEventListener("click", (event) => {
      event.preventDefault();
      header.classList.toggle("collapsed");
      const content = header.nextElementSibling as HTMLElement;
      content.classList.toggle("collapsed");
    });
  });
}

function showPermissionRequest(url: string): void {
  const origin = new URL(url).origin;
  const domain = new URL(url).hostname;

  const modal = document.getElementById("permission-modal") as HTMLDivElement;
  const mainContent = document.getElementById("main-content") as HTMLDivElement;
  const domainElement = document.getElementById("permission-domain") as HTMLDivElement;
  const grantBtn = document.getElementById("grant-btn") as HTMLButtonElement;
  const cancelBtn = document.getElementById("cancel-btn") as HTMLButtonElement;

  domainElement.textContent = domain;
  modal.classList.remove("hidden");
  mainContent.classList.add("modal-open");

  const handleGrant = async (): Promise<void> => {
    try {
      const granted = await browser.permissions.request({ origins: [`${origin}/*`] });
      if (granted) window.close();
      else hidePermissionModal();
    } catch (error) {
      console.error("Error requesting permission:", error);
      hidePermissionModal();
    }
  };
  const handleCancel = (): void => hidePermissionModal();

  grantBtn.addEventListener("click", handleGrant);
  cancelBtn.addEventListener("click", handleCancel);
}

function hidePermissionModal(): void {
  const modal = document.getElementById("permission-modal") as HTMLDivElement;
  const mainContent = document.getElementById("main-content") as HTMLDivElement;
  modal.classList.add("hidden");
  mainContent.classList.remove("modal-open");
}

async function refreshAllSitesStatus(): Promise<void> {
  if (!allSitesStatusElement) return;
  try {
    const granted = await browser.permissions.contains({ origins: ALL_SITES_ORIGINS });
    if (granted) {
      allSitesStatusElement.textContent = "All-sites access is currently granted.";
      allSitesStatusElement.style.color = "#2e7d32";
    } else {
      allSitesStatusElement.textContent = "All-sites access is not granted — per-domain prompts will appear.";
      allSitesStatusElement.style.color = "#666";
    }
  } catch (error) {
    console.error("Error checking all-sites permission:", error);
  }
}

function flashAllSitesFeedback(message: string, color: string): void {
  if (!allSitesFeedbackElement) return;
  allSitesFeedbackElement.textContent = message;
  allSitesFeedbackElement.style.color = color;
  setTimeout(() => {
    allSitesFeedbackElement.textContent = "";
    allSitesFeedbackElement.style.color = "";
  }, 3000);
}

async function handleGrantAllSites(event: MouseEvent): Promise<void> {
  if (!event.isTrusted) return;
  try {
    const granted = await browser.permissions.request({ origins: ALL_SITES_ORIGINS });
    flashAllSitesFeedback(
      granted ? "All-sites access granted." : "Permission request declined.",
      granted ? "#2e7d32" : "#c62828",
    );
    await refreshAllSitesStatus();
  } catch (error) {
    console.error("Error requesting all-sites permission:", error);
    flashAllSitesFeedback("Failed to request permission. Check the console.", "#c62828");
  }
}

async function handleRevokeAllSites(event: MouseEvent): Promise<void> {
  if (!event.isTrusted) return;
  try {
    const removed = await browser.permissions.remove({ origins: ALL_SITES_ORIGINS });
    flashAllSitesFeedback(
      removed ? "All-sites access revoked." : "Nothing to revoke.",
      removed ? "#2e7d32" : "#666",
    );
    await refreshAllSitesStatus();
  } catch (error) {
    console.error("Error revoking all-sites permission:", error);
    flashAllSitesFeedback("Failed to revoke permission. Check the console.", "#c62828");
  }
}

saveDomainListsButton.addEventListener("click", saveDomainLists);
clearAuditLogButton.addEventListener("click", handleClearAuditLog);
grantAllSitesButton?.addEventListener("click", handleGrantAllSites);
revokeAllSitesButton?.addEventListener("click", handleRevokeAllSites);

document.addEventListener("DOMContentLoaded", () => {
  createToolSettingsUI();
  loadDomainLists();
  loadAuditLog();
  refreshAllSitesStatus();
  initializeCollapsibleSections();

  const modal = document.getElementById("permission-modal") as HTMLDivElement;
  const mainContent = document.getElementById("main-content") as HTMLDivElement;
  modal.classList.add("hidden");
  mainContent.classList.remove("modal-open");

  const params = new URLSearchParams(window.location.search);
  const requestUrl = params.get("requestUrl");
  if (requestUrl) {
    showPermissionRequest(requestUrl);
  }

  setInterval(loadAuditLog, 5000);
});

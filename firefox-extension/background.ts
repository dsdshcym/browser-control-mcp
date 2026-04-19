import { getConfig } from "./extension-config";

// TODO(phase 4.1): wire MessageHandler to browser.runtime.connectNative once
// the native-host UDS bridge lands.

async function initExtension() {
  const config = await getConfig();
  console.log("Browser extension initialized (no transport wired yet)");
  return config;
}

initExtension().catch((error) => {
  console.error("Error initializing extension:", error);
});

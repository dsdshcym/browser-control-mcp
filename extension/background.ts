import { getConfig } from "./extension-config";
import { startNativeBridge } from "./native-bridge";

async function initExtension(): Promise<void> {
  await getConfig();
  startNativeBridge();
  console.log("Browser Control CLI extension initialized");
}

initExtension().catch((error) => {
  console.error("Error initializing extension:", error);
});

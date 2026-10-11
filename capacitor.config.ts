import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.littlecolorclub.app",
  appName: "Little Color Club",
  webDir: "dist",
  backgroundColor: "#FFFAF2",
  android: {
    backgroundColor: "#FFFAF2",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;

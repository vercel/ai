import type { HarnessV1Bootstrap } from "@ai-sdk/harness";
import {
  acpBridgeBootstrapFiles,
  ACP_BRIDGE_INSTALL_COMMANDS,
} from "@ai-sdk/harness-acp";

const BOOTSTRAP_DIR = "/tmp/harness/cursor";

export async function getCursorBootstrap(): Promise<HarnessV1Bootstrap> {
  const bridgeFiles = await acpBridgeBootstrapFiles(BOOTSTRAP_DIR);
  return {
    harnessId: "cursor",
    bootstrapDir: BOOTSTRAP_DIR,
    files: bridgeFiles,
    commands: [
      ...ACP_BRIDGE_INSTALL_COMMANDS(BOOTSTRAP_DIR),
      {
        command:
          "command -v agent >/dev/null 2>&1 || curl -fsSL https://cursor.com/install | bash",
      },
      { command: "agent --version || agent --help" },
    ],
  };
}
import type { HarnessV1Bootstrap } from "@ai-sdk/harness";
import {
  acpBridgeBootstrapFiles,
  ACP_BRIDGE_INSTALL_COMMANDS,
} from "@ai-sdk/harness-acp";

const BOOTSTRAP_DIR = "/tmp/harness/grok";
const GROK_BIN_DIR = `${BOOTSTRAP_DIR}/bin`;
export const GROK_CLI = `${GROK_BIN_DIR}/grok`;

export async function getGrokBootstrap(): Promise<HarnessV1Bootstrap> {
  const bridgeFiles = await acpBridgeBootstrapFiles(BOOTSTRAP_DIR);
  return {
    harnessId: "grok",
    bootstrapDir: BOOTSTRAP_DIR,
    files: bridgeFiles,
    commands: [
      ...ACP_BRIDGE_INSTALL_COMMANDS(BOOTSTRAP_DIR),
      {
        command: [
          `mkdir -p ${GROK_BIN_DIR}`,
          `test -x ${GROK_CLI} || (export GROK_BIN_DIR=${GROK_BIN_DIR} && curl -fsSL https://x.ai/cli/install.sh | bash)`,
        ].join(" && "),
      },
      { command: `${GROK_CLI} --version || ${GROK_CLI} --help` },
    ],
  };
}
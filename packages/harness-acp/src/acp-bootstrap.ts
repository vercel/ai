import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HarnessV1Bootstrap } from "@ai-sdk/harness";

const BRIDGE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "bridge");

async function readBridgeAsset(name: string): Promise<string> {
  return readFile(path.join(BRIDGE_DIR, name), "utf8");
}

export async function acpBridgeBootstrapFiles(
  bootstrapDir: string,
): Promise<HarnessV1Bootstrap["files"]> {
  const [pkg, bridge] = await Promise.all([
    readBridgeAsset("package.json"),
    readBridgeAsset("index.mjs"),
  ]);
  return [
    { path: `${bootstrapDir}/package.json`, content: pkg },
    { path: `${bootstrapDir}/bridge.mjs`, content: bridge },
  ];
}

export const ACP_BRIDGE_INSTALL_COMMANDS = (bootstrapDir: string) => [
  { command: `mkdir -p ${bootstrapDir}` },
  {
    command: `cd ${bootstrapDir} && npm install --omit=dev`,
  },
];
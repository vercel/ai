import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { tool } from "ai";
import { z } from "zod";
import {
  VERCEL_AI_SDK_ADAPTER_VERSION,
  VERCEL_AI_SDK_TOOL_NAME,
  createSvsVercelAiSdkTools
} from "@svsprotocol/solana/vercel-ai";

const REQUIRED_ENV = [
  "SVS_SERVER_URL",
  "SVS_BOT_ID",
  "SVS_BOT_POLICY_ID",
  "SVS_BOT_API_KEY",
  "SVS_BOT_REQUEST_SIGNING_SECRET",
  "SVS_BOT_EXPECTED_INTEGRATION_CONTRACT_HASH",
  "SOLANA_RPC_URL"
];

const LIVE_SUBMIT_REQUIRED_ENV = [
  ...REQUIRED_ENV,
  "SVS_SERIALIZED_TRANSACTION_BASE64"
];

export function createSvsVerifiedVercelAiSdkTools(env = process.env) {
  assertRequiredEnv(env);

  return createSvsVercelAiSdkTools({
    tool,
    z,
    baseUrl: env.SVS_SERVER_URL,
    apiKey: env.SVS_BOT_API_KEY,
    requestSigningSecret: env.SVS_BOT_REQUEST_SIGNING_SECRET,
    expectedIntegrationContractHash: env.SVS_BOT_EXPECTED_INTEGRATION_CONTRACT_HASH,
    botId: env.SVS_BOT_ID,
    policyId: env.SVS_BOT_POLICY_ID,
    rpcUrl: env.SOLANA_RPC_URL,
    waitForProof: env.SVS_WAIT_FOR_PROOF === "true",
    fetchProof: true,
    checkReceiptRegistryChain: true
  });
}

export async function requireSvsVerifiedVercelAiSdkReady(env = process.env) {
  const svs = createSvsVerifiedVercelAiSdkTools(env);

  await svs.requireSvsProductionReady({
    requireNoExpiredPreviousSigningSecrets: true
  });

  return {
    ok: true,
    toolName: VERCEL_AI_SDK_TOOL_NAME
  };
}

export async function submitSvsVerifiedVercelAiSdkAction({
  requestId,
  intent,
  serializedTransaction,
  simulation,
  metadata = {}
}, env = process.env) {
  const svs = createSvsVerifiedVercelAiSdkTools(env);

  await svs.requireSvsProductionReady({
    requireNoExpiredPreviousSigningSecrets: true
  });

  return svs.verifyAndSubmitSolanaAction({
    requestId,
    idempotencyKey: requestId,
    intent,
    serializedTransaction,
    simulation,
    metadata,
    source: {
      agentFramework: "vercel-ai-sdk",
      adapter: VERCEL_AI_SDK_ADAPTER_VERSION,
      example: "svs-verified-action"
    }
  });
}

export function getSvsVercelAiSdkExampleInfo() {
  return {
    ok: true,
    runtime: "Vercel AI SDK",
    hostPackageImported: typeof tool === "function",
    adapterVersion: VERCEL_AI_SDK_ADAPTER_VERSION,
    toolName: VERCEL_AI_SDK_TOOL_NAME,
    packageExport: "@svsprotocol/solana/vercel-ai",
    liveSubmitOptIn: "SVS_RUN_LIVE_SUBMIT=true"
  };
}

function assertRequiredEnv(env) {
  const missing = REQUIRED_ENV.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required SVS env values: ${missing.join(", ")}`);
  }
}

function assertLiveSubmitEnv(env) {
  const missing = LIVE_SUBMIT_REQUIRED_ENV.filter((name) => !env[name]);

  if (missing.length > 0) {
    throw new Error(`Missing required SVS live-submit env values: ${missing.join(", ")}`);
  }
}

function isDirectRun(metaUrl, argvPath = process.argv[1]) {
  if (!argvPath) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(metaUrl)) === realpathSync(argvPath);
  } catch {
    return fileURLToPath(metaUrl) === argvPath;
  }
}

if (isDirectRun(import.meta.url)) {
  const info = getSvsVercelAiSdkExampleInfo();

  if (process.env.SVS_RUN_LIVE_SUBMIT !== "true") {
    console.log(JSON.stringify({
      ...info,
      status: "dry_run",
      nextAction: "Set SVS_RUN_LIVE_SUBMIT=true only after filling real SVS credentials and a prepared transaction."
    }, null, 2));
    process.exit(0);
  }

  assertLiveSubmitEnv(process.env);

  const result = await submitSvsVerifiedVercelAiSdkAction({
    requestId: `svs-vercel-ai-${Date.now()}`,
    intent: {
      botId: process.env.SVS_BOT_ID,
      type: "memo",
      summary: "Submit a Vercel AI SDK Solana tool call through SVS human approval."
    },
    serializedTransaction: process.env.SVS_SERIALIZED_TRANSACTION_BASE64,
    simulation: {
      ok: true,
      source: "provided-by-agent"
    }
  });

  console.log(JSON.stringify(result, null, 2));
}

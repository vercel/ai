import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const files = {
  readme: await readFile(new URL("./README.md", import.meta.url), "utf8"),
  packageJson: JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8")),
  envExample: await readFile(new URL("./.env.example", import.meta.url), "utf8"),
  example: await readFile(new URL("./svs-verified-action.mjs", import.meta.url), "utf8")
};

assert.equal(files.packageJson.private, true);
assert.equal(files.packageJson.type, "module");
assert.equal(files.packageJson.dependencies["@svsprotocol/solana"], "^0.2.0");
assert.equal(files.packageJson.dependencies.ai, "^6.0.202");
assert.equal(files.packageJson.dependencies.zod, "^4.4.3");
assert.equal(files.packageJson.scripts.validate, "node ./validate.mjs");

for (const required of [
  "Vercel AI SDK",
  "examples/svs-verified-action/",
  "Protocol Or Wallet Gate",
  "createHostedVerifiedAgentRegistryMiddleware",
  "https://svsprotocol.com/docs",
  "https://registry.svsprotocol.com/registry.json",
  "https://svsprotocol.com/docs#verified-agent-standard",
  "https://svsprotocol.com/verify",
  "SVS_RUN_LIVE_SUBMIT=true",
  "no API keys"
]) {
  assert.match(files.readme, new RegExp(escapeRegExp(required)));
}

assert.match(files.readme, /The default run is import validation only/);
assert.doesNotMatch(files.readme, /import\/config validation only/);
assert.doesNotMatch(files.readme, /private SVS operator repository/);
assert.doesNotMatch(files.readme, /From the SVS repository/);

for (const required of [
  "SVS_SERVER_URL",
  "SVS_BOT_ID",
  "SVS_BOT_POLICY_ID",
  "SVS_BOT_API_KEY",
  "SVS_BOT_REQUEST_SIGNING_SECRET",
  "SVS_BOT_EXPECTED_INTEGRATION_CONTRACT_HASH",
  "SOLANA_RPC_URL",
  "SVS_SERIALIZED_TRANSACTION_BASE64",
  "SVS_RUN_LIVE_SUBMIT=false"
]) {
  assert.match(files.envExample, new RegExp(escapeRegExp(required)));
}

for (const required of [
  "ai",
  "zod",
  "@svsprotocol/solana/vercel-ai",
  "VERCEL_AI_SDK_ADAPTER_VERSION",
  "VERCEL_AI_SDK_TOOL_NAME",
  "createSvsVercelAiSdkTools",
  "requireSvsProductionReady",
  "verifyAndSubmitSolanaAction",
  "assertLiveSubmitEnv",
  "isDirectRun",
  "fileURLToPath",
  "SVS_SERIALIZED_TRANSACTION_BASE64",
  "SVS_RUN_LIVE_SUBMIT"
]) {
  assert.match(files.example, new RegExp(escapeRegExp(required)));
}

for (const [name, text] of Object.entries({
  readme: files.readme,
  envExample: files.envExample,
  example: files.example
})) {
  assertNoCommittedSecret(name, text);
}

const dryRun = JSON.parse(execFileSync(process.execPath, [
  fileURLToPath(new URL("./svs-verified-action.mjs", import.meta.url))
], {
  encoding: "utf8"
}));

assert.equal(dryRun.ok, true);
assert.equal(dryRun.status, "dry_run");
assert.equal(dryRun.packageExport, "@svsprotocol/solana/vercel-ai");
assert.equal(dryRun.toolName, "svsVerifyAndSubmitSolanaAction");

console.log(JSON.stringify({
  ok: true,
  package: files.packageJson.name,
  target: "vercel-ai-sdk",
  packageExport: "@svsprotocol/solana/vercel-ai",
  toolName: "svsVerifyAndSubmitSolanaAction",
  dryRun: {
    status: dryRun.status,
    packageExport: dryRun.packageExport,
    toolName: dryRun.toolName
  }
}, null, 2));

function assertNoCommittedSecret(name, text) {
  const secretPatterns = [
    /svs_live_[A-Za-z0-9_-]{8,}/,
    /svs_req_live_[A-Za-z0-9_-]{8,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\[[\d,\s]{80,}\]/
  ];

  for (const pattern of secretPatterns) {
    assert.doesNotMatch(text, pattern, `${name} includes secret-looking material`);
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

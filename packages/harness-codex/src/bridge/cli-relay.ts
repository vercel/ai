/*
 * Temporary workaround for upstream codex CLI bug
 * https://github.com/openai/codex/issues/19425 — MCP tools registered via
 * `mcp_servers.*` are not exposed to the model in `codex exec --experimental-json`
 * mode (which is what `@openai/codex-sdk` uses). The MCP handshake completes
 * and `tools/list` succeeds, but codex never registers the tools as
 * model-callable functions.
 *
 * Until that's fixed upstream, this file implements a CLI-based relay:
 *
 *   1. A small Node script is written into the workdir at turn start
 *      (`buildCliShimScript`). It accepts `<toolName> <jsonInput>` as argv,
 *      POSTs to the same HTTP relay the MCP shim uses, and prints the
 *      result to stdout.
 *
 *   2. Tool descriptions and invocation instructions are injected into the
 *      user prompt (`composeToolUsageInstructions`), telling the model to
 *      call host tools by running `node <shim-path> <toolName> '<jsonInput>'`
 *      via its built-in `bash` tool.
 *
 *   3. The bridge's event loop suppresses the matching `command_execution`
 *      events (`isToolRelayCommand`) so callers receive clean `tool-call` /
 *      `tool-result` events from the HTTP relay rather than seeing the
 *      relay invocations as raw bash commands.
 *
 * Once #19425 is fixed and MCP tools are properly exposed in exec mode, the
 * three hookpoints in `bridge/index.ts` can be removed along with this file.
 */

export const CLI_SHIM_FILENAME = 'harness-tool.mjs';

export function buildCliShimScript({
  relayPort,
  relayToken,
}: {
  relayPort: number;
  relayToken: string;
}): string {
  return `#!/usr/bin/env node
const [toolName, inputJson = '{}'] = process.argv.slice(2);
if (!toolName) {
  console.error('Usage: harness-tool <tool_name> <json_input>');
  process.exit(64);
}
let input;
try {
  input = JSON.parse(inputJson);
} catch (error) {
  console.error('Invalid JSON input: ' + (error instanceof Error ? error.message : String(error)));
  process.exit(64);
}
const requestId = 'cli-' + Date.now() + '-' + Math.random().toString(16).slice(2);
const response = await fetch('http://127.0.0.1:${relayPort}', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ${relayToken}' },
  body: JSON.stringify({ requestId, toolName, input }),
});
const text = await response.text();
let payload;
try {
  payload = text ? JSON.parse(text) : {};
} catch {
  payload = { error: text };
}
if (!response.ok || payload.error) {
  console.error(String(payload.error ?? ('tool relay failed with HTTP ' + response.status)));
  process.exit(1);
}
console.log(JSON.stringify(payload.result ?? payload, null, 2));
`;
}

export function composeToolUsageInstructions({
  tools,
  cliShimPath,
}: {
  tools: ReadonlyArray<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
  cliShimPath: string;
}): string {
  const lines: string[] = [
    '## Host tools',
    '',
    'You have access to the following host-provided tools. To use one, run the following command via your built-in `bash` tool:',
    '',
    `  node ${cliShimPath} <toolName> '<jsonInput>'`,
    '',
    'The script prints the JSON result to stdout. Do not invent another way to call these tools — only this CLI invocation will work. Pass the JSON input as a single-quoted argument.',
    '',
  ];
  for (const tool of tools) {
    lines.push(`### ${tool.name}`);
    if (tool.description) lines.push(tool.description);
    lines.push(
      `Input schema: \`${JSON.stringify(tool.inputSchema ?? {})}\``,
      '',
    );
  }
  return lines.join('\n');
}

export function isToolRelayCommand({
  command,
  cliShimPath,
}: {
  command: string;
  cliShimPath: string;
}): boolean {
  return command.includes(cliShimPath);
}

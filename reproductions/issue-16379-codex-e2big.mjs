#!/usr/bin/env node
// Reproduction for vercel/ai#16379: harness-codex passes a large host tool
// catalog through Codex config, which @openai/codex-sdk serializes into one
// --config argv entry. On Linux this exceeds MAX_ARG_STRLEN and spawn fails
// with E2BIG before Codex can launch.

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { createRequire } from 'node:module';

const root = process.cwd();
const requireFromHarnessCodex = createRequire(
  `${root}/packages/harness-codex/package.json`,
);
const { WebSocket } = requireFromHarnessCodex('ws');
const reproDir = `${root}/.tmp/issue-16379-codex-e2big`;
const stateDir = `${reproDir}/bridge`;
const cliShimDir = `${reproDir}/codex`;
const token = 'issue-16379-token';
const bridgeEnv = { ...process.env };
delete bridgeEnv.AI_GATEWAY_API_KEY;
delete bridgeEnv.AI_GATEWAY_BASE_URL;

function makeLargeTools(count = 170) {
  return Array.from({ length: count }, (_, i) => ({
    name: `host_tool_${i}`,
    description: `Host tool ${i} ${'description '.repeat(12)}`,
    inputSchema: {
      type: 'object',
      properties: Object.fromEntries(
        Array.from({ length: 12 }, (_, j) => [
          `field_${j}`,
          {
            type: 'string',
            description: `Large field ${j} ${'schema text '.repeat(12)}`,
          },
        ]),
      ),
      required: Array.from({ length: 12 }, (_, j) => `field_${j}`),
    },
  }));
}

function waitForReady(proc) {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(
      () => reject(new Error(`bridge did not become ready\nstdout=${stdout}\nstderr=${stderr}`)),
      10_000,
    );
    proc.stdout.on('data', chunk => {
      stdout += chunk;
      for (const line of stdout.split('\n')) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.type === 'bridge-ready') {
            clearTimeout(timer);
            resolve(msg.port);
          }
        } catch {
          // keep buffering
        }
      }
    });
    proc.stderr.on('data', chunk => {
      stderr += chunk;
    });
    proc.once('exit', code => {
      clearTimeout(timer);
      reject(new Error(`bridge exited before ready with code ${code}\nstdout=${stdout}\nstderr=${stderr}`));
    });
  });
}

await rm(reproDir, { recursive: true, force: true });
await mkdir(stateDir, { recursive: true });
await mkdir(cliShimDir, { recursive: true });

const bridge = spawn(
  process.execPath,
  [
    'packages/harness-codex/dist/bridge/index.mjs',
    '--workdir', root,
    '--bridge-state-dir', stateDir,
    '--bootstrap-dir', `${root}/packages/harness-codex/dist/bridge`,
    '--cli-shim-dir', cliShimDir,
  ],
  {
    cwd: root,
    env: {
      ...bridgeEnv,
      BRIDGE_CHANNEL_TOKEN: token,
      BRIDGE_WS_PORT: '0',
      // No API key is needed: the failure happens in child_process.spawn()
      // before the codex process can start or make a network request.
      CODEX_API_KEY: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

const port = await waitForReady(bridge);
const ws = new WebSocket(`ws://127.0.0.1:${port}/?agent_bridge_token=${encodeURIComponent(token)}`);
await once(ws, 'open');

const messages = [];
ws.on('message', data => {
  const msg = JSON.parse(data.toString('utf8'));
  messages.push(msg);
  console.log(JSON.stringify(msg));
});

while (!messages.some(msg => msg.type === 'bridge-hello')) {
  await new Promise(resolve => setTimeout(resolve, 10));
}

const tools = makeLargeTools();
const serialized = JSON.stringify(
  tools.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
);
console.error(`TOOL_SCHEMAS bytes: ${Buffer.byteLength(serialized)}`);

ws.send(
  JSON.stringify({
    type: 'start',
    prompt: 'Say hello. The test should fail before Codex launches.',
    tools,
    model: 'gpt-5.3-codex',
  }),
);

const deadline = Date.now() + 10_000;
while (
  Date.now() < deadline &&
  !messages.some(msg => msg.type === 'error' && JSON.stringify(msg).includes('E2BIG'))
) {
  await new Promise(resolve => setTimeout(resolve, 25));
}

ws.send(JSON.stringify({ type: 'shutdown' }));
await new Promise(resolve => setTimeout(resolve, 200));
bridge.kill('SIGTERM');

const eventLog = await readFile(`${stateDir}/event-log.ndjson`, 'utf8').catch(
  () => '',
);
if (!eventLog.includes('E2BIG')) {
  console.error(`Expected bridge event log to contain E2BIG. Event log:\n${eventLog}`);
  process.exit(1);
}
console.error(`Bridge event log contains E2BIG at ${stateDir}/event-log.ndjson`);
process.exit(0);

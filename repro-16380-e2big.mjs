#!/usr/bin/env node
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createOpencodeServer } from './packages/harness-opencode/node_modules/@opencode-ai/sdk/dist/server.js';

const tmp = await mkdtemp(join(tmpdir(), 'opencode-e2big-repro-'));
const fakeBin = join(tmp, 'bin');
await mkdir(fakeBin);
await writeFile(
  join(fakeBin, 'opencode'),
  `#!/usr/bin/env sh\necho "opencode server listening on http://127.0.0.1:4096"\nsleep 10\n`,
  { mode: 0o755 },
);
process.env.PATH = `${fakeBin}:${process.env.PATH ?? ''}`;

const smoke = await createOpencodeServer({
  config: { share: 'disabled', autoupdate: false },
  timeout: 1000,
  port: 4096,
});
smoke.close();
console.log('Small inline config launched fake opencode successfully.');

function makeTools(count) {
  return Array.from({ length: count }, (_, i) => ({
    name: `host_tool_${i}`,
    description: 'large host tool schema '.repeat(10),
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['input'],
      properties: Object.fromEntries(
        Array.from({ length: 8 }, (_, j) => [
          `field_${j}`,
          {
            type: 'string',
            description: `schema detail for tool ${i} field ${j} `.repeat(5),
          },
        ]),
      ),
    },
  }));
}

const tools = makeTools(170);
const config = {
  share: 'disabled',
  autoupdate: false,
  mcp: {
    'harness-tools': {
      type: 'local',
      enabled: true,
      command: ['node', '/tmp/host-tool-mcp.mjs'],
      environment: {
        TOOL_SCHEMAS: JSON.stringify(tools),
        TOOL_RELAY_URL: 'http://127.0.0.1:12345',
      },
    },
  },
};

const inlineConfigBytes = Buffer.byteLength(JSON.stringify(config));
const toolSchemasBytes = Buffer.byteLength(config.mcp['harness-tools'].environment.TOOL_SCHEMAS);
console.log(`TOOL_SCHEMAS bytes: ${toolSchemasBytes}`);
console.log(`OPENCODE_CONFIG_CONTENT bytes: ${inlineConfigBytes}`);

try {
  const server = await createOpencodeServer({ config, timeout: 1000, port: 4096 });
  server.close();
  console.error('Expected spawn E2BIG, but createOpencodeServer launched successfully.');
  process.exitCode = 1;
} catch (error) {
  console.log(`Observed error code: ${error?.code}`);
  console.log(`Observed error message: ${error?.message}`);
  if (error?.code !== 'E2BIG') {
    console.error('Expected E2BIG from oversized OPENCODE_CONFIG_CONTENT.');
    process.exitCode = 1;
  }
}

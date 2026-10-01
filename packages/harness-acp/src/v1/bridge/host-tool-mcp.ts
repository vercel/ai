import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { env } from 'node:process';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { HarnessV1BridgeToolWire } from '@ai-sdk/harness';
import {
  createHostToolMCPServer,
  type HostToolMCPInvocationResult,
} from './host-tool-mcp-server';
import { postHostToolRelay } from './host-tool-relay-client';

const catalogPath = requireEnvironmentVariable({
  name: 'AI_SDK_ACP_HOST_TOOLS_FILE',
});
const relayUrl = requireEnvironmentVariable({
  name: 'AI_SDK_ACP_HOST_TOOL_RELAY_URL',
});
const relayCredential = requireEnvironmentVariable({
  name: 'AI_SDK_ACP_HOST_TOOL_RELAY_CREDENTIAL',
});
const tools = await readToolCatalog({ path: catalogPath });
const hostToolServer = createHostToolMCPServer({
  tools,
  invoke: async ({ toolName, input, catalogRevision }) =>
    validateInvocationResult({
      value: await postRelay({
        path: '/invoke',
        body: {
          requestId: randomUUID(),
          toolName,
          input,
          catalogRevision,
        },
      }),
    }),
  onListTools: async ({ revision }) => {
    await postRelay({
      path: '/catalog/seen',
      body: { revision },
    });
  },
});

await hostToolServer.server.connect(new StdioServerTransport());
void watchCatalog({
  initialRevision: 1,
  updateCatalog: hostToolServer.updateCatalog,
}).catch(error => {
  process.stderr.write(
    `Host tool catalog synchronization failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`,
  );
  void hostToolServer.server.close();
  process.exitCode = 1;
});

async function watchCatalog({
  initialRevision,
  updateCatalog,
}: {
  initialRevision: number;
  updateCatalog: (options: {
    revision: number;
    tools: ReadonlyArray<HarnessV1BridgeToolWire>;
  }) => Promise<void>;
}): Promise<void> {
  let revision = initialRevision;
  for (;;) {
    const value = await postRelay({
      path: '/catalog/next',
      body: { afterRevision: revision },
    });
    if (isRecord(value) && value.closed === true) return;
    if (
      !isRecord(value) ||
      !Number.isSafeInteger(value.revision) ||
      (value.revision as number) < revision
    ) {
      throw new Error('Invalid host tool catalog poll response.');
    }
    const nextRevision = value.revision as number;
    if (nextRevision === revision) continue;
    const nextTools = validateToolCatalog({ value: value.tools });
    await updateCatalog({ revision: nextRevision, tools: nextTools });
    revision = nextRevision;
  }
}

async function postRelay({
  path,
  body,
}: {
  path: string;
  body: Readonly<Record<string, unknown>>;
}): Promise<unknown> {
  const response = await postHostToolRelay({
    relayUrl,
    relayCredential,
    path,
    body,
  });
  const { value } = response;
  if (!response.ok) {
    throw new Error(readErrorMessage({ value, status: response.status }));
  }
  return value;
}

function validateToolCatalog({
  value,
}: {
  value: unknown;
}): ReadonlyArray<HarnessV1BridgeToolWire> {
  if (!Array.isArray(value) || !value.every(isTool)) {
    throw new Error('Invalid host tool catalog.');
  }
  return value;
}

async function readToolCatalog({
  path,
}: {
  path: string;
}): Promise<ReadonlyArray<HarnessV1BridgeToolWire>> {
  const text = await readFile(path, 'utf8');
  const value = await new Response(text, {
    headers: { 'content-type': 'application/json' },
  }).json();
  return validateToolCatalog({ value });
}

function isTool(value: unknown): value is HarnessV1BridgeToolWire {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    (value.description === undefined ||
      typeof value.description === 'string') &&
    (value.inputSchema === undefined ||
      (isRecord(value.inputSchema) && !Array.isArray(value.inputSchema)))
  );
}

function validateInvocationResult({
  value,
}: {
  value: unknown;
}): HostToolMCPInvocationResult {
  if (
    !isRecord(value) ||
    typeof value.correlationToken !== 'string' ||
    (value.isError !== undefined && typeof value.isError !== 'boolean')
  ) {
    throw new Error('Invalid host tool relay response.');
  }
  return {
    output: value.output,
    ...(value.isError ? { isError: true } : {}),
    correlationToken: value.correlationToken,
  };
}

function readErrorMessage({
  value,
  status,
}: {
  value: unknown;
  status: number;
}): string {
  return isRecord(value) && typeof value.error === 'string'
    ? value.error
    : `Host tool relay returned HTTP ${status}.`;
}

function requireEnvironmentVariable({ name }: { name: string }): string {
  const value = env[name];
  if (value == null || value.length === 0) {
    throw new Error(`Missing ${name}.`);
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

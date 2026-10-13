import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createMCPClient, type MCPTransport } from '@ai-sdk/mcp';
import { streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import ts from 'typescript';
import { z } from 'zod';
import { InMemoryTransport } from '../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/inMemory.js';
import { McpServer } from '../../../mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';

const examplePath = new URL(
  '../../../mcp/src/shopify-mcp/client.ts',
  import.meta.url,
);
const harnessKey = '__issue20184Harness';

const usage = {
  inputTokens: {
    total: 1,
    noCache: 1,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 1,
    text: 1,
    reasoning: undefined,
  },
};

function submitOrderModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: convertArrayToReadableStream([
        {
          type: 'tool-call' as const,
          toolCallId: 'submit-order-call',
          toolName: 'submit_order',
          input: JSON.stringify({ totalCents: 2500 }),
        },
        {
          type: 'finish' as const,
          finishReason: { unified: 'tool-calls' as const, raw: undefined },
          usage,
        },
      ]),
    }),
  });
}

function dataModule(source: string): string {
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
}

function replaceModuleSpecifier(
  source: string,
  specifier: string,
  replacement: string,
): string {
  return source
    .replaceAll(`from '${specifier}'`, `from '${replacement}'`)
    .replaceAll(`from "${specifier}"`, `from "${replacement}"`)
    .replaceAll(`import '${specifier}'`, `import '${replacement}'`)
    .replaceAll(`import "${specifier}"`, `import "${replacement}"`);
}

async function runShopifyExampleWithHarness(): Promise<void> {
  const source = await readFile(examplePath, 'utf8');
  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: 'client.ts',
  }).outputText;

  const moduleSources = {
    '@ai-sdk/openai': `
      const harness = globalThis[${JSON.stringify(harnessKey)}];
      export const openai = harness.openai;
    `,
    '@modelcontextprotocol/sdk/client/streamableHttp.js': `
      const harness = globalThis[${JSON.stringify(harnessKey)}];
      export const StreamableHTTPClientTransport =
        harness.StreamableHTTPClientTransport;
    `,
    ai: `
      const harness = globalThis[${JSON.stringify(harnessKey)}];
      export const streamText = harness.streamText;
    `,
    'dotenv/config': '',
    '@ai-sdk/mcp': `
      const harness = globalThis[${JSON.stringify(harnessKey)}];
      export const createMCPClient = harness.createMCPClient;
    `,
  };

  for (const [specifier, moduleSource] of Object.entries(moduleSources)) {
    compiled = replaceModuleSpecifier(
      compiled,
      specifier,
      dataModule(moduleSource),
    );
  }

  await import(
    `${dataModule(compiled)}#${encodeURIComponent(pathToFileURL(examplePath.pathname).href)}`
  );
}

async function main() {
  let orderCount = 0;
  let totalCents = 0;
  let approvalEvents = 0;
  let configuredToolApproval = false;
  const exampleErrors: unknown[][] = [];

  const server = new McpServer({
    name: 'storefront-reproduction',
    version: '1.0.0',
  });

  server.registerTool(
    'get_product',
    {
      description: 'Read a product.',
      inputSchema: { id: z.string() },
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => ({
      content: [{ type: 'text', text: `Product ${id}` }],
    }),
  );

  server.registerTool(
    'create_cart',
    {
      description: 'Create a shopping cart.',
      inputSchema: {},
      annotations: { readOnlyHint: false },
    },
    async () => ({
      content: [{ type: 'text', text: 'Cart created' }],
    }),
  );

  server.registerTool(
    'submit_order',
    {
      description: 'Submit an order and charge the customer.',
      inputSchema: { totalCents: z.number().int().positive() },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ totalCents: submittedTotal }) => {
      orderCount++;
      totalCents += submittedTotal;
      return {
        content: [{ type: 'text', text: 'Order submitted' }],
      };
    },
  );

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const mcpClient = await createMCPClient({
    transport: clientTransport as unknown as MCPTransport,
  });

  try {
    const tools = await mcpClient.tools();
    const annotations = (
      tools.submit_order.metadata as
        | {
            annotations?: Record<string, unknown>;
          }
        | undefined
    )?.annotations;

    assert.deepEqual(
      annotations,
      {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
      'MCP submit_order safety annotations were not preserved in tool metadata',
    );

    let finishExample: () => void;
    const exampleFinished = new Promise<void>(resolve => {
      finishExample = resolve;
    });

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      exampleErrors.push(args);
      originalConsoleError(...args);
    };

    Object.assign(globalThis, {
      [harnessKey]: {
        openai: () => submitOrderModel(),
        StreamableHTTPClientTransport: class {},
        createMCPClient: async () => ({
          tools: async () => tools,
          close: async () => finishExample(),
        }),
        streamText: (
          options: Parameters<typeof streamText>[0],
        ): ReturnType<typeof streamText> => {
          configuredToolApproval = options.toolApproval != null;
          const originalOnChunk = options.onChunk;

          return streamText({
            ...options,
            onChunk: async event => {
              if (event.chunk.type === 'tool-approval-request') {
                approvalEvents++;
              }
              await originalOnChunk?.(event);
            },
          });
        },
      },
    });

    try {
      await runShopifyExampleWithHarness();
      await Promise.race([
        exampleFinished,
        new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new Error('Shopify MCP example did not finish')),
            5000,
          );
        }),
      ]);
    } finally {
      console.error = originalConsoleError;
      Reflect.deleteProperty(globalThis, harnessKey);
    }

    assert.deepEqual(exampleErrors, [], 'Shopify MCP example logged an error');

    console.log(
      JSON.stringify(
        {
          example: {
            path: 'examples/mcp/src/shopify-mcp/client.ts',
            configuredToolApproval,
          },
          conversion: {
            annotations,
          },
          outcome: {
            orderCreated: orderCount > 0,
            orderCount,
            totalCents,
            approvalEvents,
          },
        },
        null,
        2,
      ),
    );

    assert.equal(
      orderCount,
      0,
      'ISSUE_20184_REPRODUCED: Shopify MCP example executed destructive submit_order without approval',
    );
  } finally {
    await mcpClient.close();
    await server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

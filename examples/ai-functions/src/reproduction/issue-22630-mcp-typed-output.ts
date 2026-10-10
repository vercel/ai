import assert from 'node:assert/strict';
import {
  createMCPClient,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import { z } from 'zod';

const expectedOutcomes = [
  {
    output: { content: [], total: 7 },
    converted: {
      type: 'json',
      value: { content: [], total: 7 },
    },
  },
  {
    output: 7,
    converted: {
      type: 'json',
      value: 7,
    },
  },
];

async function main() {
  const transport: MCPTransport = {
    async start() {},
    async close() {
      this.onclose?.();
    },
    async send(message: JSONRPCMessage) {
      if (
        'method' in message &&
        'id' in message &&
        message.method === 'tools/call'
      ) {
        this.onmessage?.({
          jsonrpc: '2.0',
          id: message.id,
          result: {
            content: [],
            structuredContent: { content: [], total: 7 },
          },
        });
      }
    },
  };

  const client = await createMCPClient({
    transport,
    initialInitializeResult: {
      protocolVersion: '2025-11-25',
      capabilities: { tools: {} },
      serverInfo: { name: 'mock', version: '1' },
    },
  });

  try {
    const definition = {
      tools: [
        {
          name: 'report',
          inputSchema: { type: 'object' as const, properties: {} },
        },
      ],
    };
    const outcomes: unknown[] = [];

    for (const outputSchema of [
      z.object({ content: z.array(z.unknown()), total: z.number() }),
      z.object({ total: z.number() }).transform(value => value.total),
    ]) {
      const { report } = client.toolsFromDefinitions(definition, {
        schemas: {
          report: {
            inputSchema: z.object({}),
            outputSchema,
          },
        },
      });

      const output = await report.execute({});
      assert.ok(
        output == null ||
          typeof output !== 'object' ||
          !(Symbol.asyncIterator in output),
        'MCP tool unexpectedly returned an async iterable',
      );

      try {
        const converted = await report.toModelOutput?.({
          toolCallId: 'call',
          input: {},
          output,
        });
        outcomes.push({ output, converted });
      } catch (error) {
        outcomes.push({
          output,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    try {
      assert.deepEqual(outcomes, expectedOutcomes);
    } catch (error) {
      console.error('Observed outcomes:', JSON.stringify(outcomes));
      throw new Error(
        'ISSUE_22630_REPRODUCED: typed MCP outputs were not preserved as JSON',
        { cause: error },
      );
    }
  } finally {
    await client.close();
  }
}

await main();

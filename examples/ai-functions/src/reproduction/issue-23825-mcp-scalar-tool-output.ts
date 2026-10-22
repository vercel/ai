import {
  createMCPClient,
  type CallToolResult,
  type JSONRPCMessage,
  type MCPTransport,
} from '@ai-sdk/mcp';
import { jsonSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Minimal in-memory MCP transport: answers initialize, tools/list, tools/call.
const transport: MCPTransport = {
  onmessage: undefined,
  async start() {},
  async close() {},
  async send(message: JSONRPCMessage) {
    if (!('method' in message) || !('id' in message)) {
      return;
    }
    const respond = (result: unknown) =>
      this.onmessage?.({ jsonrpc: '2.0', id: message.id, result } as never);

    if (message.method === 'initialize') {
      respond({
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'issue-23825', version: '1.0.0' },
        capabilities: { tools: {} },
      });
    }
    if (message.method === 'tools/list') {
      respond({
        tools: [
          {
            name: 'count',
            description: 'Returns a count',
            inputSchema: { type: 'object' },
            outputSchema: {
              type: 'object',
              properties: { n: { type: 'number' } },
            },
          },
        ],
      });
    }
    if (message.method === 'tools/call') {
      respond({
        content: [{ type: 'text', text: 'n=7' }],
        structuredContent: { n: 7 },
      } satisfies CallToolResult);
    }
  },
};

async function main() {
  const client = await createMCPClient({ transport });

  // The output schema transforms the structured payload into a scalar, like
  // the producers in #22630 and #23825 do.
  const tools = await client.tools({
    schemas: {
      count: {
        inputSchema: jsonSchema({ type: 'object' }),
        outputSchema: z.object({ n: z.number() }).transform(value => value.n),
      },
    },
  });

  const output = await tools['count'].execute!(
    {},
    { messages: [], toolCallId: 'call-1', context: {} },
  );
  console.log('execute output:', output);

  // mcpToModelOutput receives that scalar. Before the fix it throws
  // "TypeError: t is not an Object. (evaluating '"content"in t')" here.
  const modelOutput = tools['count'].toModelOutput!({
    toolCallId: 'call-1',
    input: {},
    output,
  });
  console.log('model output:', JSON.stringify(modelOutput));

  await client.close();
}

main().catch(error => {
  console.error('ISSUE #23825 REPRODUCED:', error);
  process.exitCode = 1;
});

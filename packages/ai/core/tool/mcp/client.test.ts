import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createMCPClient, MCPClient } from './client';
import { MockStdioTransport } from './mock-mcp-stdio-server';
import { z } from 'zod';
import { CallToolResult } from './types';

vi.mock('./transport.ts', () => {
  return {
    createMcpTransport: vi.fn(_config => {
      return new MockStdioTransport();
    }),
  };
});

describe('MCPClient', () => {
  describe('stdio', () => {
    let client: MCPClient;

    beforeEach(async () => {
      client = await createMCPClient({
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      });
    });

    afterEach(async () => {
      await client?.close();
    });

    it('should return AI SDK compatible tool set', async () => {
      const tools = await client.tools();
      expect(tools).toHaveProperty('mock-tool');

      const tool = tools['mock-tool'];
      expect(tool).toHaveProperty('parameters');
      expect(tool).toHaveProperty('execute');
      expect(tool.execute).toBeInstanceOf(Function);
    });

    it('should return typed AI SDK compatible tool set', async () => {
      const tools = await client.tools({
        schemas: {
          'mock-tool': {
            parameters: z.object({
              foo: z.string(),
            }),
          },
        },
      });
      expect(tools).toHaveProperty('mock-tool');
      const tool = tools['mock-tool'];

      type ToolParams = Parameters<typeof tool.execute>[0];
      expectTypeOf<ToolParams>().toEqualTypeOf<{ foo: string }>();

      const result = await tool.execute(
        { foo: 'bar' },
        {
          messages: [],
          toolCallId: '1',
        },
      );

      expectTypeOf<typeof result>().toEqualTypeOf<CallToolResult>();
    });

    it('should not return user-defined tool if it is nonexistent', async () => {
      const tools = await client.tools({
        schemas: {
          'nonexistent-tool': {
            parameters: z.object({ bar: z.string() }),
          },
        },
      });

      expect(tools).not.toHaveProperty('nonexistent-tool');
    });

    // TODO(Grace): Determine desired behavior
    it('should not return user-defined tool if it is misconfigured', async () => {
      const tools = await client.tools({
        schemas: {
          'mock-tool': {
            parameters: z.object({ bar: z.string() }),
          },
        },
      });
      expect(tools).toHaveProperty('mock-tool');
    });
  });

  describe.only('sse', () => {
    let client: MCPClient;
    const server = createTestServer({
      'http://localhost:3000/sse': {
        response: {
          type: 'sse',
          events: [
            {
              data: {
                jsonrpc: '2.0',
                id: 1,
                result: {
                  serverInfo: {
                    name: 'mock-mcp-sse-server',
                    version: '1.0.0',
                  },
                  serverCapabilities: {
                    tools: {},
                  },
                },
              },
            },
          ],
        },
      },
      'http://localhost:3000/messages': {
        response: {
          type: 'json-value',
          body: { jsonrpc: '2.0', id: 1, result: {} },
        },
      },
    });

    beforeEach(async () => {
      server.urls['http://localhost:3000/messages'].response = {
        type: 'json-value',
        body: { jsonrpc: '2.0', id: 1, result: {} },
      };

      client = await createMCPClient({
        transport: {
          type: 'sse',
          url: 'http://localhost:3000',
        },
      });

      server.calls.forEach(async call => {
        if (call.requestUrl.includes('/messages')) {
          const body = await call.requestBody;

          if (body.method === 'tools/list') {
            server.addSseEvent('http://localhost:3000/sse', {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                tools: [
                  {
                    name: 'mock-tool',
                    description: 'A mock tool',
                    inputSchema: {
                      type: 'object',
                      properties: {
                        foo: { type: 'string' },
                      },
                      required: ['foo'],
                    },
                  },
                ],
              },
            });
          } else if (body.method === 'tools/call') {
            server.addSseEvent('http://localhost:3000/sse', {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: 'Mock tool call result',
                  },
                ],
              },
            });
          }
        }
      });
    });

    afterEach(async () => {
      await client?.close();
    });

    it('should return AI SDK compatible tool set', async () => {
      const tools = await client.tools();
      expect(tools).toHaveProperty('mock-tool');
      const tool = tools['mock-tool'];
      expect(tool).toHaveProperty('parameters');
      expect(tool).toHaveProperty('execute');
      expect(tool.execute).toBeInstanceOf(Function);
    });
  });
});

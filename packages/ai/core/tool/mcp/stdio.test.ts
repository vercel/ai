import { createMCPClient } from './client';
import { MockStdioTransport } from './mock-mcp-stdio-server';
import { z } from 'zod';
import { CallToolResult } from './types';
import { MCPClientError } from '../../../errors';

const createMockTransport = vi.fn(config => new MockStdioTransport(config));
vi.mock('./transport.ts', () => {
  return {
    createMcpTransport: vi.fn(config => {
      return createMockTransport(config);
    }),
  };
});

describe.skip('MCPClient', () => {
  describe('stdio', () => {
    let client: Awaited<ReturnType<typeof createMCPClient>>;

    beforeEach(async () => {
      createMockTransport.mockClear();
      createMockTransport.mockImplementation(() => new MockStdioTransport());
    });

    afterEach(async () => {
      await client?.close();
    });

    it('should return AI SDK compatible tool set', async () => {
      client = await createMCPClient({
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      });
      const tools = await client.tools();
      expect(tools).toHaveProperty('mock-tool');

      const tool = tools['mock-tool'];
      expect(tool).toHaveProperty('parameters');
      expect(tool.parameters).toMatchObject({
        jsonSchema: {
          type: 'object',
          properties: {
            foo: { type: 'string' },
          },
        },
      });
      expect(tool).toHaveProperty('execute');
      expect(
        await tool.execute(
          { foo: 'bar' },
          {
            messages: [],
            toolCallId: '1',
          },
        ),
      ).toEqual({
        content: [
          {
            type: 'text',
            text: 'Mock tool call result',
          },
        ],
      });
    });

    it('should return typed AI SDK compatible tool set', async () => {
      client = await createMCPClient({
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      });
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
      client = await createMCPClient({
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      });
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
      client = await createMCPClient({
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      });
      const tools = await client.tools({
        schemas: {
          'mock-tool': {
            parameters: z.object({ bar: z.string() }),
          },
        },
      });
      expect(tools).toHaveProperty('mock-tool');
    });

    it('should throw if the server does not support any tools', async () => {
      createMockTransport.mockImplementation(
        () =>
          new MockStdioTransport({
            overrideTools: [],
          }),
      );

      client = await createMCPClient({
        transport: { type: 'stdio', command: 'node', args: ['test.js'] },
      });

      await expect(client.tools()).rejects.toThrow(MCPClientError);
    });
  });
});

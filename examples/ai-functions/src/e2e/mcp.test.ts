import { createMCPClient } from '@ai-sdk/mcp';
import { describe, expect, it } from 'vitest';

class ImageMockTransport {
  onmessage?: (message: unknown) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  private toolName: string;
  private content: unknown[];

  constructor({ toolName, content }: { toolName: string; content: unknown[] }) {
    this.toolName = toolName;
    this.content = content;
  }

  async start(): Promise<void> {}

  async send(message: {
    method?: string;
    id?: string | number;
  }): Promise<void> {
    if (message.method === 'initialize') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          protocolVersion: '2024-11-05',
          serverInfo: { name: 'test', version: '1.0.0' },
          capabilities: { tools: {} },
        },
      });
    }

    if (message.method === 'tools/list') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          tools: [
            {
              name: this.toolName,
              description: 'Test tool',
              inputSchema: { type: 'object' },
            },
          ],
        },
      });
    }

    if (message.method === 'tools/call') {
      this.onmessage?.({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          content: this.content,
          isError: false,
        },
      });
    }
  }

  async close(): Promise<void> {
    this.onclose?.();
  }
}

describe('MCP', () => {
  describe('image content', () => {
    it('should convert MCP image content to AI SDK format via toModelOutput', async () => {
      const mockImageData =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

      const client = await createMCPClient({
        transport: new ImageMockTransport({
          toolName: 'screenshot',
          content: [
            { type: 'image', data: mockImageData, mimeType: 'image/png' },
          ],
        }),
      });

      const tools = await client.tools();
      const tool = tools['screenshot'];

      expect(
        await tool.execute!({}, { messages: [], toolCallId: '1' }),
      ).toEqual({
        content: [
          { type: 'image', data: mockImageData, mimeType: 'image/png' },
        ],
        isError: false,
      });

      expect(tool.toModelOutput).toBeDefined();

      expect(
        tool.toModelOutput!({
          toolCallId: '1',
          input: {},
          output: {
            content: [
              { type: 'image', data: mockImageData, mimeType: 'image/png' },
            ],
            isError: false,
          },
        }),
      ).toEqual({
        type: 'content',
        value: [
          { type: 'image-data', data: mockImageData, mediaType: 'image/png' },
        ],
      });

      await client.close();
    });

    it('should convert mixed text and image content', async () => {
      const mockImageData = 'base64imagedata';
      const content = [
        { type: 'text' as const, text: 'Here is the analysis:' },
        { type: 'image' as const, data: mockImageData, mimeType: 'image/jpeg' },
        { type: 'text' as const, text: 'Analysis complete.' },
      ];

      const client = await createMCPClient({
        transport: new ImageMockTransport({ toolName: 'analyze', content }),
      });

      const tools = await client.tools();
      const tool = tools['analyze'];

      expect(
        await tool.execute!({}, { messages: [], toolCallId: '1' }),
      ).toEqual({ content, isError: false });

      expect(
        tool.toModelOutput!({
          toolCallId: '1',
          input: {},
          output: { content, isError: false },
        }),
      ).toEqual({
        type: 'content',
        value: [
          { type: 'text', text: 'Here is the analysis:' },
          { type: 'image-data', data: mockImageData, mediaType: 'image/jpeg' },
          { type: 'text', text: 'Analysis complete.' },
        ],
      });

      await client.close();
    });
  });
});

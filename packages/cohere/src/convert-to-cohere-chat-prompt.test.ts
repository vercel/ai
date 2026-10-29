import { convertToCohereChatPrompt } from './convert-to-cohere-chat-prompt';
import { describe, it, expect } from 'vitest';

describe('convert to cohere chat prompt', () => {
  describe('file processing', () => {
    it('should extract documents from file parts', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Analyze this file: ' },
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: Buffer.from('This is file content'),
              },
              mediaType: 'text/plain',
              filename: 'test.txt',
            },
          ],
        },
      ]);

      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: 'Analyze this file: ',
          },
        ],
        documents: [
          {
            data: {
              text: 'This is file content',
              title: 'test.txt',
            },
          },
        ],
        warnings: [],
      });
    });

    it('should accept top-level-only mediaType without error (category D: mediaType not consumed)', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: Buffer.from('This is file content'),
              },
              mediaType: 'text',
              filename: 'test.txt',
            },
          ],
        },
      ]);

      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: '',
          },
        ],
        documents: [
          {
            data: {
              text: 'This is file content',
              title: 'test.txt',
            },
          },
        ],
        warnings: [],
      });
    });

    it('should not read mediaType (document payload carries only text + title)', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: Buffer.from('PDF-like content'),
              },
              mediaType: 'application/pdf',
              filename: 'test.pdf',
            },
          ],
        },
      ]);

      expect(result.documents).toEqual([
        {
          data: {
            text: 'PDF-like content',
            title: 'test.pdf',
          },
        },
      ]);
      const payload = JSON.stringify(result);
      expect(payload).not.toContain('application/pdf');
      expect(payload).not.toContain('mediaType');
    });
  });

  describe('image processing', () => {
    it('should convert image file with data bytes into image_url data URI', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]);

      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'What is in this image?' },
              {
                type: 'image_url',
                image_url: { url: 'data:image/png;base64,AAECAw==' },
              },
            ],
          },
        ],
        documents: [],
        warnings: [],
      });
    });

    it('should convert image file with URL data into image_url URL', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'url' as const,
                url: new URL('https://example.com/cat.png'),
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]);

      expect(result).toEqual({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'https://example.com/cat.png' },
              },
            ],
          },
        ],
        documents: [],
        warnings: [],
      });
    });

    it('should pass through detail provider option as image_url.detail', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'image/png',
              providerOptions: {
                cohere: { detail: 'high' },
              },
            },
          ],
        },
      ]);

      expect(result.messages[0]).toEqual({
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,AAECAw==',
              detail: 'high',
            },
          },
        ],
      });
    });

    it('should omit detail when no provider option is set', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]);

      const userMessage = result.messages[0];
      expect(userMessage.role).toBe('user');
      expect(Array.isArray(userMessage.content)).toBe(true);
      const part = (userMessage.content as Array<unknown>)[0] as {
        type: string;
        image_url: { url: string; detail?: string };
      };
      expect(part.type).toBe('image_url');
      expect(part.image_url.detail).toBeUndefined();
    });

    it('should send image inline and route non-image file to documents', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'See attached:' },
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: new Uint8Array([0, 1, 2, 3]),
              },
              mediaType: 'image/png',
            },
            {
              type: 'file',
              data: {
                type: 'data' as const,
                data: Buffer.from('Doc text'),
              },
              mediaType: 'text/plain',
              filename: 'note.txt',
            },
          ],
        },
      ]);

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'See attached:' },
            {
              type: 'image_url',
              image_url: { url: 'data:image/png;base64,AAECAw==' },
            },
          ],
        },
      ]);
      expect(result.documents).toEqual([
        {
          data: {
            text: 'Doc text',
            title: 'note.txt',
          },
        },
      ]);
    });

    it('should accept top-level "image" media type and detect full type from bytes', async () => {
      const pngSignature = new Uint8Array([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      ]);
      const result = await convertToCohereChatPrompt([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: { type: 'data' as const, data: pngSignature },
              mediaType: 'image',
            },
          ],
        },
      ]);

      const part = (result.messages[0].content as Array<unknown>)[0] as {
        type: string;
        image_url: { url: string };
      };
      expect(part.type).toBe('image_url');
      expect(part.image_url.url).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('tool messages', () => {
    it('should convert a tool call into a cohere chatbot message', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Calling a tool',
            },
            {
              type: 'tool-call',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              input: { test: 'This is a tool message' },
            },
          ],
        },
      ]);

      expect(result).toEqual({
        messages: [
          {
            content: undefined,
            role: 'assistant',
            tool_calls: [
              {
                id: 'tool-call-1',
                type: 'function',
                function: {
                  name: 'tool-1',
                  arguments: JSON.stringify({ test: 'This is a tool message' }),
                },
              },
            ],
          },
        ],
        documents: [],
        warnings: [],
      });
    });

    it('should convert a single tool result into a cohere tool message', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              output: {
                type: 'json',
                value: { test: 'This is a tool message' },
              },
            },
          ],
        },
      ]);

      expect(result).toEqual({
        messages: [
          {
            role: 'tool',
            content: JSON.stringify({ test: 'This is a tool message' }),
            tool_call_id: 'tool-call-1',
          },
        ],
        documents: [],
        warnings: [],
      });
    });

    it('should convert multiple tool results into a cohere tool message', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolName: 'tool-1',
              toolCallId: 'tool-call-1',
              output: {
                type: 'json',
                value: { test: 'This is a tool message' },
              },
            },
            {
              type: 'tool-result',
              toolName: 'tool-2',
              toolCallId: 'tool-call-2',
              output: { type: 'json', value: { something: 'else' } },
            },
          ],
        },
      ]);

      expect(result).toEqual({
        messages: [
          {
            role: 'tool',
            content: JSON.stringify({ test: 'This is a tool message' }),
            tool_call_id: 'tool-call-1',
          },
          {
            role: 'tool',
            content: JSON.stringify({ something: 'else' }),
            tool_call_id: 'tool-call-2',
          },
        ],
        documents: [],
        warnings: [],
      });
    });
  });

  describe('provider reference', () => {
    it('should throw for file parts with provider references', async () => {
      await expect(
        convertToCohereChatPrompt([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: {
                  type: 'reference' as const,
                  reference: { cohere: 'doc-ref-123' },
                },
                mediaType: 'text/plain',
              },
            ],
          },
        ]),
      ).rejects.toThrow(
        "'file parts with provider references' functionality not supported",
      );
    });
  });

  describe('tool argument and output serialization resilience', () => {
    it('preserves string tool call arguments without double-stringifying', async () => {
      const result = await convertToCohereChatPrompt([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'search',
              input: '{"query":"cohere command","limit":5}',
            },
          ],
        },
      ]);

      expect(result.messages[0]).toEqual({
        role: 'assistant',
        content: undefined,
        tool_plan: undefined,
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"cohere command","limit":5}',
            },
          },
        ],
      });
    });

    it('safely serializes BigInt and circular structures in tool call arguments', async () => {
      const cyclicInput: any = { id: 12345678901234567890n };
      cyclicInput.self = cyclicInput;

      const result = await convertToCohereChatPrompt([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'process',
              input: cyclicInput,
            },
          ],
        },
      ]);

      const message = result.messages[0];
      if (message.role !== 'assistant') {
        throw new Error('expected an assistant message');
      }
      const args = message.tool_calls?.[0].function.arguments;
      expect(args).toContain('"id":"12345678901234567890"');
      expect(args).toContain('"self":"[Circular]"');
    });

    it('safely serializes BigInt and circular structures in tool responses', async () => {
      const cyclicOutput: any = { count: 999999999999999999n };
      cyclicOutput.self = cyclicOutput;

      const result = await convertToCohereChatPrompt([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-3',
              toolName: 'getData',
              output: {
                type: 'json',
                value: cyclicOutput,
              },
            },
          ],
        },
      ]);

      const content = result.messages[0].content as string;
      expect(content).toContain('"count":"999999999999999999"');
      expect(content).toContain('"self":"[Circular]"');
    });

    it('preserves reused non-circular objects in tool outputs', async () => {
      const shared = { city: 'Paris' };

      const result = await convertToCohereChatPrompt([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-4',
              toolName: 'getData',
              output: {
                type: 'json',
                value: { first: shared, second: shared },
              },
            },
          ],
        },
      ]);

      const content = result.messages[0].content as string;
      expect(content).toContain('"first":{"city":"Paris"}');
      expect(content).toContain('"second":{"city":"Paris"}');
      expect(content).not.toContain('[Circular]');
    });
  });
});

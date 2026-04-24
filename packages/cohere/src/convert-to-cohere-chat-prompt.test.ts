import { convertToCohereChatPrompt } from './convert-to-cohere-chat-prompt';
import { describe, it, expect } from 'vitest';

describe('convert to cohere chat prompt', () => {
  describe('file processing', () => {
    it('should extract documents from file parts', () => {
      const result = convertToCohereChatPrompt([
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

    it('should accept top-level-only mediaType without error (category D: mediaType not consumed)', () => {
      const result = convertToCohereChatPrompt([
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

    it('should not read mediaType (document payload carries only text + title)', () => {
      const result = convertToCohereChatPrompt([
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

  describe('tool messages', () => {
    it('should convert a tool call into a cohere chatbot message', async () => {
      const result = convertToCohereChatPrompt([
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
      const result = convertToCohereChatPrompt([
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
      const result = convertToCohereChatPrompt([
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
    it('should throw for file parts with provider references', () => {
      expect(() =>
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
      ).toThrow(
        "'file parts with provider references' functionality not supported",
      );
    });
  });
});

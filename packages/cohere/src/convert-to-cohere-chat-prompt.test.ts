import { convertToCohereChatPrompt } from './convert-to-cohere-chat-prompt';

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
              data: Buffer.from('This is file content'),
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

    it('should throw error for unsupported media types', () => {
      expect(() => {
        convertToCohereChatPrompt([
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: Buffer.from('PDF content'),
                mediaType: 'application/pdf',
                filename: 'test.pdf',
              },
            ],
          },
        ]);
      }).toThrow("Media type 'application/pdf' is not supported");
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
});

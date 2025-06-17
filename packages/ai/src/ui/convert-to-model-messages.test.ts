import { z } from 'zod';
import { convertToModelMessages } from './convert-to-model-messages';
import { ModelMessage } from '../../core/prompt/message';
import { tool } from '../../core/tool/tool';

describe('convertToModelMessages', () => {
  describe('system message', () => {
    it('should convert a simple system message', () => {
      const result = convertToModelMessages([
        {
          role: 'system',
          parts: [{ text: 'System message', type: 'text' }],
        },
      ]);

      expect(result).toEqual([{ role: 'system', content: 'System message' }]);
    });
  });

  describe('user message', () => {
    it('should convert a simple user message', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          parts: [{ text: 'Hello, AI!', type: 'text' }],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello, AI!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('should handle user message file parts', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          parts: [
            {
              type: 'file',
              mediaType: 'image/jpeg',
              url: 'https://example.com/image.jpg',
            },
            { type: 'text', text: 'Check this image' },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              mediaType: 'image/jpeg',
              data: 'https://example.com/image.jpg',
            },
            { type: 'text', text: 'Check this image' },
          ],
        },
      ]);
    });
  });

  describe('assistant message', () => {
    it('should convert a simple assistant message', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello, human!' }],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello, human!' }],
        },
      ]);
    });

    it('should convert an assistant message with reasoning', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'Thinking...',
              providerMetadata: {
                testProvider: {
                  signature: '1234567890',
                },
              },
            },
            {
              type: 'reasoning',
              text: 'redacted-data',
              providerMetadata: {
                testProvider: { isRedacted: true },
              },
            },
            { type: 'text', text: 'Hello, human!' },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'Thinking...',
              providerOptions: { testProvider: { signature: '1234567890' } },
            },
            {
              type: 'reasoning',
              text: 'redacted-data',
              providerOptions: { testProvider: { isRedacted: true } },
            },
            { type: 'text', text: 'Hello, human!' },
          ],
        },
      ] satisfies ModelMessage[]);
    });

    it('should convert an assistant message with file parts', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              url: 'data:image/png;base64,dGVzdA==',
            },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'file',
              mediaType: 'image/png',
              data: 'data:image/png;base64,dGVzdA==',
            },
          ],
        },
      ] satisfies ModelMessage[]);
    });

    it('should handle assistant message with tool invocations', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            { type: 'text', text: 'Let me calculate that for you.' },
            {
              type: 'tool-calculator',
              state: 'output-available',
              toolCallId: 'call1',
              input: { operation: 'add', numbers: [1, 2] },
              output: '3',
            },
          ],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle assistant message with tool invocations that have multi-part responses', () => {
      const tools = {
        screenshot: tool({
          inputSchema: z.object({}),
          execute: async () => 'imgbase64',
          experimental_toToolResultContent: result => [
            { type: 'image', data: result },
          ],
        }),
      };

      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              { type: 'text', text: 'Let me calculate that for you.' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call1',
                input: {},
                output: 'imgbase64',
              },
            ],
          },
        ],
        { tools }, // separate tools to ensure that types are inferred correctly
      );

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with an assistant message that has empty tool invocations', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          parts: [{ type: 'text', text: 'text1' }],
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'text2' }],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with multiple tool invocations that have step information', () => {
      const tools = {
        screenshot: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              { type: 'text', text: 'response' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-1',
                input: { value: 'value-1' },
                output: 'result-1',
              },
              { type: 'step-start' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-2',
                input: { value: 'value-2' },
                output: 'result-2',
              },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-3',
                input: { value: 'value-3' },
                output: 'result-3',
              },
              { type: 'step-start' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-4',
                input: { value: 'value-4' },
                output: 'result-4',
              },
            ],
          },
        ],
        { tools }, // separate tools to ensure that types are inferred correctly
      );

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with mix of tool invocations and text', () => {
      const tools = {
        screenshot: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              { type: 'text', text: 'i am gonna use tool1' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-1',
                input: { value: 'value-1' },
                output: 'result-1',
              },
              { type: 'step-start' },
              { type: 'text', text: 'i am gonna use tool2 and tool3' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-2',
                input: { value: 'value-2' },
                output: 'result-2',
              },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-3',
                input: { value: 'value-3' },
                output: 'result-3',
              },
              { type: 'step-start' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-4',
                input: { value: 'value-4' },
                output: 'result-4',
              },
              { type: 'step-start' },
              { type: 'text', text: 'final response' },
            ],
          },
        ],
        { tools }, // separate tools to ensure that types are inferred correctly
      );

      expect(result).toMatchSnapshot();
    });
  });

  describe('multiple messages', () => {
    it('should handle a conversation with multiple messages', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          parts: [{ type: 'text', text: "What's the weather like?" }],
        },
        {
          role: 'assistant',
          parts: [{ type: 'text', text: "I'll check that for you." }],
        },
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Thanks!' }],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "What's the weather like?",
                "type": "text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "text": "I'll check that for you.",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "text": "Thanks!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('should handle conversation with multiple tool invocations and user message at the end', () => {
      const tools = {
        screenshot: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-1',
                input: { value: 'value-1' },
                output: 'result-1',
              },
              { type: 'step-start' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-2',
                input: { value: 'value-2' },
                output: 'result-2',
              },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-3',
                input: { value: 'value-3' },
                output: 'result-3',
              },
              { type: 'step-start' },
              {
                type: 'tool-screenshot',
                state: 'output-available',
                toolCallId: 'call-4',
                input: { value: 'value-4' },
                output: 'result-4',
              },
              { type: 'step-start' },
              { type: 'text', text: 'response' },
            ],
          },
          {
            role: 'user',
            parts: [{ type: 'text', text: 'Thanks!' }],
          },
        ],
        { tools }, // separate tools to ensure that types are inferred correctly
      );

      expect(result).toMatchSnapshot();
    });
  });

  describe('error handling', () => {
    it('should throw an error for unhandled roles', () => {
      expect(() => {
        convertToModelMessages([
          {
            role: 'unknown' as any,
            parts: [{ text: 'unknown role message', type: 'text' }],
          },
        ]);
      }).toThrow('Unsupported role: unknown');
    });
  });
});

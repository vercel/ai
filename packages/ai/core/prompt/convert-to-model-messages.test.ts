import { z } from 'zod';
import { tool } from '../tool/tool';
import { convertToModelMessages } from './convert-to-model-messages';
import { ModelMessage } from './message';

describe('convertToModelMessages', () => {
  describe('system message', () => {
    it('should convert a simple system message', () => {
      const result = convertToModelMessages([
        {
          role: 'system',
          content: 'System message',
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
          content: 'Hello, AI!',
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

    it('should prefer content in parts when content is empty', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          content: '', // empty content
          parts: [
            {
              type: 'text',
              text: 'hey, how is it going?',
            },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'hey, how is it going?' }],
        },
      ]);
    });

    it('should handle user message file parts', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          content: 'Check this image',
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
          content: '', // empty content
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
          content: '', // empty content
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
          content: '', // empty content
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
          content: '', // empty content
          parts: [
            { type: 'text', text: 'Let me calculate that for you.' },
            {
              type: 'tool-invocation',
              toolInvocation: {
                state: 'result',
                toolCallId: 'call1',
                toolName: 'calculator',
                args: { operation: 'add', numbers: [1, 2] },
                result: '3',
                step: 0,
              },
            },
          ],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle assistant message with tool invocations that have multi-part responses', () => {
      const tools = {
        screenshot: tool({
          parameters: z.object({}),
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
            content: '', // empty content
            parts: [
              { type: 'text', text: 'Let me calculate that for you.' },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call1',
                  toolName: 'screenshot',
                  args: {},
                  result: 'imgbase64',
                  step: 0,
                },
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
          content: 'text1',
          parts: [{ type: 'text', text: 'text1' }],
        },
        {
          role: 'assistant',
          content: '', // empty content
          parts: [{ type: 'text', text: 'text2' }],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with multiple tool invocations that have step information', () => {
      const tools = {
        screenshot: tool({
          parameters: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            content: '', // empty content
            parts: [
              { type: 'text', text: 'response' },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-1',
                  toolName: 'screenshot',
                  args: { value: 'value-1' },
                  result: 'result-1',
                  step: 0,
                },
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-2',
                  toolName: 'screenshot',
                  args: { value: 'value-2' },
                  result: 'result-2',
                  step: 1,
                },
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-3',
                  toolName: 'screenshot',
                  args: { value: 'value-3' },
                  result: 'result-3',
                  step: 1,
                },
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-4',
                  toolName: 'screenshot',
                  args: { value: 'value-4' },
                  result: 'result-4',
                  step: 2,
                },
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
          parameters: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            content: '', // empty content
            parts: [
              { type: 'text', text: 'i am gonna use tool1' },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-1',
                  toolName: 'screenshot',
                  args: { value: 'value-1' },
                  result: 'result-1',
                  step: 0,
                },
              },
              { type: 'text', text: 'i am gonna use tool2 and tool3' },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-2',
                  toolName: 'screenshot',
                  args: { value: 'value-2' },
                  result: 'result-2',
                  step: 1,
                },
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-3',
                  toolName: 'screenshot',
                  args: { value: 'value-3' },
                  result: 'result-3',
                  step: 1,
                },
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-4',
                  toolName: 'screenshot',
                  args: { value: 'value-4' },
                  result: 'result-4',
                  step: 2,
                },
              },
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
          content: "What's the weather like?",
          parts: [{ type: 'text', text: "What's the weather like?" }],
        },
        {
          role: 'assistant',
          content: '',
          parts: [{ type: 'text', text: "I'll check that for you." }],
        },
        {
          role: 'user',
          content: 'Thanks!',
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
          parameters: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            content: '',
            parts: [
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-1',
                  toolName: 'screenshot',
                  args: { value: 'value-1' },
                  result: 'result-1',
                  step: 0,
                },
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-2',
                  toolName: 'screenshot',
                  args: { value: 'value-2' },
                  result: 'result-2',
                  step: 1,
                },
              },

              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-3',
                  toolName: 'screenshot',
                  args: { value: 'value-3' },
                  result: 'result-3',
                  step: 1,
                },
              },
              {
                type: 'tool-invocation',
                toolInvocation: {
                  state: 'result',
                  toolCallId: 'call-4',
                  toolName: 'screenshot',
                  args: { value: 'value-4' },
                  result: 'result-4',
                  step: 2,
                },
              },
              { type: 'text', text: 'response' },
            ],
          },
          {
            role: 'user',
            content: 'Thanks!',
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
            content: 'unknown role message',
            parts: [{ text: 'unknown role message', type: 'text' }],
          },
        ]);
      }).toThrow('Unsupported role: unknown');
    });
  });
});

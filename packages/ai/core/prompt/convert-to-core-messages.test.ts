import { Attachment, Message } from '@ai-sdk/ui-utils';
import { convertToCoreMessages } from './convert-to-core-messages';
import { tool } from '../tool/tool';
import { z } from 'zod';
import { CoreMessage } from './message';

describe('convertToCoreMessages', () => {
  describe('system message', () => {
    it('should convert a simple system message', () => {
      const result = convertToCoreMessages([
        { role: 'system', content: 'System message' },
      ]);

      expect(result).toEqual([{ role: 'system', content: 'System message' }]);
    });
  });

  describe('user message', () => {
    it('should convert a simple user message', () => {
      const result = convertToCoreMessages([
        { role: 'user', content: 'Hello, AI!' },
      ]);

      expect(result).toEqual([{ role: 'user', content: 'Hello, AI!' }]);
    });

    it('should prefer content in parts when content is empty', () => {
      const result = convertToCoreMessages([
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

    it('should handle user message with attachments', () => {
      const attachment: Attachment = {
        contentType: 'image/jpeg',
        url: 'https://example.com/image.jpg',
      };

      const result = convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this image',
          experimental_attachments: [attachment],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Check this image' },
            { type: 'image', image: new URL('https://example.com/image.jpg') },
          ],
        },
      ]);
    });

    it('should handle user message with attachments (file)', () => {
      const attachment: Attachment = {
        contentType: 'application/pdf',
        url: 'https://example.com/document.pdf',
      };

      const result = convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this document',
          experimental_attachments: [attachment],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Check this document' },
            {
              type: 'file',
              data: new URL('https://example.com/document.pdf'),
              mimeType: 'application/pdf',
            },
          ],
        },
      ]);
    });

    it('should handle user message with attachment URLs', () => {
      const attachment: Attachment = {
        contentType: 'image/jpeg',
        url: 'data:image/jpg;base64,dGVzdA==',
      };

      const result = convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this image',
          experimental_attachments: [attachment],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle user message with attachment URLs (file)', () => {
      const attachment: Attachment = {
        contentType: 'application/pdf',
        url: 'data:application/pdf;base64,dGVzdA==',
      };

      const result = convertToCoreMessages([
        {
          role: 'user',
          content: 'Check this document',
          experimental_attachments: [attachment],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should throw an error for invalid attachment URLs', () => {
      const attachment: Attachment = {
        contentType: 'image/jpeg',
        url: 'invalid-url',
      };

      expect(() => {
        convertToCoreMessages([
          {
            role: 'user',
            content: 'Check this image',
            experimental_attachments: [attachment],
          },
        ]);
      }).toThrow('Invalid URL: invalid-url');
    });

    it('should throw an error for file attachments without contentType', () => {
      const attachment: Attachment = {
        url: 'data:application/pdf;base64,dGVzdA==',
      };

      expect(() => {
        convertToCoreMessages([
          {
            role: 'user',
            content: 'Check this file',
            experimental_attachments: [attachment],
          },
        ]);
      }).toThrow(
        'If the attachment is not an image or text, it must specify a content type',
      );
    });

    it('should throw an error for invalid data URL format', () => {
      const attachment: Attachment = {
        contentType: 'image/jpeg',
        url: 'data:image/jpg;base64',
      };

      expect(() => {
        convertToCoreMessages([
          {
            role: 'user',
            content: 'Check this image',
            experimental_attachments: [attachment],
          },
        ]);
      }).toThrow(`Invalid data URL format: ${attachment.url}`);
    });

    it('should throw an error for unsupported attachment protocols', () => {
      const attachment: Attachment = {
        contentType: 'image/jpeg',
        url: 'ftp://example.com/image.jpg',
      };

      expect(() => {
        convertToCoreMessages([
          {
            role: 'user',
            content: 'Check this image',
            experimental_attachments: [attachment],
          },
        ]);
      }).toThrow('Unsupported URL protocol: ftp:');
    });
  });

  describe('assistant message', () => {
    it('should convert a simple assistant message', () => {
      const result = convertToCoreMessages([
        { role: 'assistant', content: 'Hello, human!' },
      ]);

      expect(result).toEqual([{ role: 'assistant', content: 'Hello, human!' }]);
    });

    it('should convert a simple assistant message (parts)', () => {
      const result = convertToCoreMessages([
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

    it('should convert an assistant message with reasoning (parts)', () => {
      const result = convertToCoreMessages([
        {
          role: 'assistant',
          content: '', // empty content
          parts: [
            {
              type: 'reasoning',
              reasoning: 'Thinking...',
              details: [
                {
                  type: 'text',
                  text: 'Thinking',
                  signature: '1234567890',
                },
                {
                  type: 'redacted',
                  data: 'redacted-data',
                },
                {
                  type: 'text',
                  text: '...',
                  signature: 'abc123',
                },
              ],
            },
            { type: 'text', text: 'Hello, human!' },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [
            { type: 'reasoning', text: 'Thinking', signature: '1234567890' },
            { type: 'redacted-reasoning', data: 'redacted-data' },
            { type: 'reasoning', text: '...', signature: 'abc123' },
            { type: 'text', text: 'Hello, human!' },
          ],
        },
      ] satisfies CoreMessage[]);
    });

    it('should convert an assistant message with file parts', () => {
      const result = convertToCoreMessages([
        {
          role: 'assistant',
          content: '', // empty content
          parts: [
            {
              type: 'file',
              mimeType: 'image/png',
              data: 'dGVzdA==',
            },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'file', mimeType: 'image/png', data: 'dGVzdA==' }],
        },
      ] satisfies CoreMessage[]);
    });

    it('should handle assistant message with tool invocations', () => {
      const result = convertToCoreMessages([
        {
          role: 'assistant',
          content: 'Let me calculate that for you.',
          toolInvocations: [
            {
              state: 'result',
              toolCallId: 'call1',
              toolName: 'calculator',
              args: { operation: 'add', numbers: [1, 2] },
              result: '3',
            },
          ],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle assistant message with tool invocations (parts)', () => {
      const result = convertToCoreMessages([
        {
          role: 'assistant',
          content: '', // empty content
          toolInvocations: [], // empty invocations
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

      const result = convertToCoreMessages(
        [
          {
            role: 'assistant',
            content: 'Let me calculate that for you.',
            toolInvocations: [
              {
                state: 'result',
                toolCallId: 'call1',
                toolName: 'screenshot',
                args: {},
                result: 'imgbase64',
              },
            ],
          },
        ],
        { tools }, // separate tools to ensure that types are inferred correctly
      );

      expect(result).toMatchSnapshot();
    });

    it('should handle assistant message with tool invocations that have multi-part responses (parts)', () => {
      const tools = {
        screenshot: tool({
          parameters: z.object({}),
          execute: async () => 'imgbase64',
          experimental_toToolResultContent: result => [
            { type: 'image', data: result },
          ],
        }),
      };

      const result = convertToCoreMessages(
        [
          {
            role: 'assistant',
            content: '', // empty content
            toolInvocations: [], // empty invocations
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
      const result = convertToCoreMessages([
        {
          role: 'user',
          content: 'text1',
          toolInvocations: [],
        },
        {
          role: 'assistant',
          content: 'text2',
          toolInvocations: [],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with an assistant message that has empty tool invocations (parts)', () => {
      const result = convertToCoreMessages([
        {
          role: 'user',
          content: 'text1',
          toolInvocations: [],
          parts: [{ type: 'text', text: 'text1' }],
        },
        {
          role: 'assistant',
          content: '', // empty content
          toolInvocations: [],
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

      const result = convertToCoreMessages(
        [
          {
            role: 'assistant',
            content: 'response',
            toolInvocations: [
              {
                state: 'result',
                toolCallId: 'call-1',
                toolName: 'screenshot',
                args: { value: 'value-1' },
                result: 'result-1',
                step: 0,
              },
              {
                state: 'result',
                toolCallId: 'call-2',
                toolName: 'screenshot',
                args: { value: 'value-2' },
                result: 'result-2',
                step: 1,
              },

              {
                state: 'result',
                toolCallId: 'call-3',
                toolName: 'screenshot',
                args: { value: 'value-3' },
                result: 'result-3',
                step: 1,
              },
              {
                state: 'result',
                toolCallId: 'call-4',
                toolName: 'screenshot',
                args: { value: 'value-4' },
                result: 'result-4',
                step: 2,
              },
            ],
          },
        ],
        { tools }, // separate tools to ensure that types are inferred correctly
      );

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with multiple tool invocations that have step information (parts)', () => {
      const tools = {
        screenshot: tool({
          parameters: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToCoreMessages(
        [
          {
            role: 'assistant',
            content: '', // empty content
            toolInvocations: [], // empty invocations
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

    it('should handle conversation with mix of tool invocations and text (parts)', () => {
      const tools = {
        screenshot: tool({
          parameters: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToCoreMessages(
        [
          {
            role: 'assistant',
            content: '', // empty content
            toolInvocations: [], // empty invocations
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
      const result = convertToCoreMessages([
        { role: 'user', content: "What's the weather like?" },
        { role: 'assistant', content: "I'll check that for you." },
        { role: 'user', content: 'Thanks!' },
      ]);

      expect(result).toEqual([
        { role: 'user', content: "What's the weather like?" },
        { role: 'assistant', content: "I'll check that for you." },
        { role: 'user', content: 'Thanks!' },
      ]);
    });

    it('should handle a conversation with multiple messages (parts)', () => {
      const result = convertToCoreMessages([
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

      expect(result).toMatchSnapshot();
    });

    it('should convert fully typed Message[]', () => {
      const messages: Message[] = [
        {
          id: '1',
          role: 'user',
          content: 'What is the weather in Tokyo?',
        },
        {
          id: '2',
          role: 'assistant',
          content: 'It is sunny in Tokyo.',
        },
      ];

      const result = convertToCoreMessages(messages);

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with multiple tool invocations and user message at the end', () => {
      const tools = {
        screenshot: tool({
          parameters: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToCoreMessages(
        [
          {
            role: 'assistant',
            content: 'response',
            toolInvocations: [
              {
                state: 'result',
                toolCallId: 'call-1',
                toolName: 'screenshot',
                args: { value: 'value-1' },
                result: 'result-1',
                step: 0,
              },
              {
                state: 'result',
                toolCallId: 'call-2',
                toolName: 'screenshot',
                args: { value: 'value-2' },
                result: 'result-2',
                step: 1,
              },

              {
                state: 'result',
                toolCallId: 'call-3',
                toolName: 'screenshot',
                args: { value: 'value-3' },
                result: 'result-3',
                step: 1,
              },
              {
                state: 'result',
                toolCallId: 'call-4',
                toolName: 'screenshot',
                args: { value: 'value-4' },
                result: 'result-4',
                step: 2,
              },
            ],
          },
          {
            role: 'user',
            content: 'Thanks!',
          },
        ],
        { tools }, // separate tools to ensure that types are inferred correctly
      );

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with multiple tool invocations and user message at the end (parts)', () => {
      const tools = {
        screenshot: tool({
          parameters: z.object({ value: z.string() }),
          execute: async () => 'imgbase64',
        }),
      };

      const result = convertToCoreMessages(
        [
          {
            role: 'assistant',
            content: '',
            toolInvocations: [],
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
        convertToCoreMessages([
          { role: 'unknown' as any, content: 'unknown role message' },
        ]);
      }).toThrow('Unsupported role: unknown');
    });
  });
});

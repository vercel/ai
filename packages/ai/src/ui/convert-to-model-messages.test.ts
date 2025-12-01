import { ModelMessage } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { convertToModelMessages } from './convert-to-model-messages';
import { UIMessage } from './ui-messages';

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

    it('should convert a system message with provider metadata', () => {
      const result = convertToModelMessages([
        {
          role: 'system',
          parts: [
            {
              text: 'System message with metadata',
              type: 'text',
              providerMetadata: { testProvider: { systemSignature: 'abc123' } },
            },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'system',
          content: 'System message with metadata',
          providerOptions: { testProvider: { systemSignature: 'abc123' } },
        },
      ]);
    });

    it('should merge provider metadata from multiple text parts in system message', () => {
      const result = convertToModelMessages([
        {
          role: 'system',
          parts: [
            {
              text: 'Part 1',
              type: 'text',
              providerMetadata: { provider1: { key1: 'value1' } },
            },
            {
              text: ' Part 2',
              type: 'text',
              providerMetadata: { provider2: { key2: 'value2' } },
            },
          ],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'system',
          content: 'Part 1 Part 2',
          providerOptions: {
            provider1: { key1: 'value1' },
            provider2: { key2: 'value2' },
          },
        },
      ]);
    });

    it('should convert a system message with Anthropic cache control metadata', () => {
      const SYSTEM_PROMPT = 'You are a helpful assistant.';

      const systemMessage = {
        id: 'system',
        role: 'system' as const,
        parts: [
          {
            type: 'text' as const,
            text: SYSTEM_PROMPT,
            providerMetadata: {
              anthropic: {
                cacheControl: { type: 'ephemeral' },
              },
            },
          },
        ],
      };

      const result = convertToModelMessages([systemMessage]);

      expect(result).toEqual([
        {
          role: 'system',
          content: SYSTEM_PROMPT,
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      ]);
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

    it('should convert a simple user message with provider metadata', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          parts: [
            {
              text: 'Hello, AI!',
              type: 'text',
              providerMetadata: { testProvider: { signature: '1234567890' } },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "providerOptions": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
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

    it('should handle user message file parts with provider metadata', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          parts: [
            {
              type: 'file',
              mediaType: 'image/jpeg',
              url: 'https://example.com/image.jpg',
              providerMetadata: { testProvider: { signature: '1234567890' } },
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
              providerOptions: { testProvider: { signature: '1234567890' } },
            },
            { type: 'text', text: 'Check this image' },
          ],
        },
      ]);
    });

    it('should include filename for user file parts when provided', () => {
      const result = convertToModelMessages([
        {
          role: 'user',
          parts: [
            {
              type: 'file',
              mediaType: 'image/jpeg',
              url: 'https://example.com/image.jpg',
              filename: 'image.jpg',
            },
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
              filename: 'image.jpg',
            },
          ],
        },
      ]);
    });
  });

  it('should not include filename for user file parts when not provided', () => {
    const result = convertToModelMessages([
      {
        role: 'user',
        parts: [
          {
            type: 'file',
            mediaType: 'image/jpeg',
            url: 'https://example.com/image.jpg',
          },
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
        ],
      },
    ]);
  });

  describe('assistant message', () => {
    it('should convert a simple assistant text message', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hello, human!', state: 'done' }],
        },
      ]);

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello, human!' }],
        },
      ]);
    });

    it('should convert a simple assistant text message with provider metadata', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            {
              type: 'text',
              text: 'Hello, human!',
              state: 'done',
              providerMetadata: { testProvider: { signature: '1234567890' } },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "providerOptions": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
                "text": "Hello, human!",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
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
              state: 'done',
            },
            {
              type: 'reasoning',
              text: 'redacted-data',
              providerMetadata: {
                testProvider: { isRedacted: true },
              },
              state: 'done',
            },
            { type: 'text', text: 'Hello, human!', state: 'done' },
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

    it('should include filename for assistant file parts when provided', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            {
              type: 'file',
              mediaType: 'image/png',
              url: 'data:image/png;base64,dGVzdA==',
              filename: 'test.png',
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
              filename: 'test.png',
            },
          ],
        },
      ] as unknown as ModelMessage[]);
    });

    it('should handle assistant message with tool output available', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'text',
              text: 'Let me calculate that for you.',
              state: 'done',
            },
            {
              type: 'tool-calculator',
              state: 'output-available',
              toolCallId: 'call1',
              input: { operation: 'add', numbers: [1, 2] },
              output: '3',
              callProviderMetadata: {
                testProvider: {
                  signature: '1234567890',
                },
              },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Let me calculate that for you.",
                "type": "text",
              },
              {
                "input": {
                  "numbers": [
                    1,
                    2,
                  ],
                  "operation": "add",
                },
                "providerExecuted": undefined,
                "providerOptions": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "text",
                  "value": "3",
                },
                "providerOptions": {
                  "testProvider": {
                    "signature": "1234567890",
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });

    it('should propagate provider metadata to tool-result (client-executed)', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'tool-calculator',
              state: 'output-available',
              toolCallId: 'call1',
              input: { operation: 'add', numbers: [1, 2] },
              output: '3',
              callProviderMetadata: {
                testProvider: {
                  executionTime: 100,
                },
              },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "numbers": [
                    1,
                    2,
                  ],
                  "operation": "add",
                },
                "providerExecuted": undefined,
                "providerOptions": {
                  "testProvider": {
                    "executionTime": 100,
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "text",
                  "value": "3",
                },
                "providerOptions": {
                  "testProvider": {
                    "executionTime": 100,
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });

    it('should propagate provider metadata to tool-result (provider-executed)', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'tool-calculator',
              state: 'output-available',
              toolCallId: 'call1',
              input: { operation: 'subtract', numbers: [10, 5] },
              output: '5',
              providerExecuted: true,
              callProviderMetadata: {
                testProvider: {
                  executionTime: 50,
                },
              },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "numbers": [
                    10,
                    5,
                  ],
                  "operation": "subtract",
                },
                "providerExecuted": true,
                "providerOptions": {
                  "testProvider": {
                    "executionTime": 50,
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
              {
                "output": {
                  "type": "text",
                  "value": "5",
                },
                "providerOptions": {
                  "testProvider": {
                    "executionTime": 50,
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should propagate provider metadata to tool-result with error state', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'tool-calculator',
              state: 'output-error',
              toolCallId: 'call1',
              input: { operation: 'divide', numbers: [10, 0] },
              errorText: 'Error: Division by zero',
              callProviderMetadata: {
                testProvider: {
                  errorCode: 'DIVISION_BY_ZERO',
                },
              },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "numbers": [
                    10,
                    0,
                  ],
                  "operation": "divide",
                },
                "providerExecuted": undefined,
                "providerOptions": {
                  "testProvider": {
                    "errorCode": "DIVISION_BY_ZERO",
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "error-text",
                  "value": "Error: Division by zero",
                },
                "providerOptions": {
                  "testProvider": {
                    "errorCode": "DIVISION_BY_ZERO",
                  },
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });

    describe('tool output error', () => {
      it('should handle assistant message with tool output error that has raw input', () => {
        const result = convertToModelMessages([
          {
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'text',
                text: 'Let me calculate that for you.',
                state: 'done',
              },
              {
                type: 'tool-calculator',
                state: 'output-error',
                toolCallId: 'call1',
                errorText: 'Error: Invalid input',
                input: undefined,
                rawInput: { operation: 'add', numbers: [1, 2] },
              },
            ],
          },
        ]);

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Let me calculate that for you.",
                "type": "text",
              },
              {
                "input": {
                  "numbers": [
                    1,
                    2,
                  ],
                  "operation": "add",
                },
                "providerExecuted": undefined,
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "error-text",
                  "value": "Error: Invalid input",
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
      });

      it('should handle assistant message with tool output error that has no raw input', () => {
        const result = convertToModelMessages([
          {
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'text',
                text: 'Let me calculate that for you.',
                state: 'done',
              },
              {
                type: 'tool-calculator',
                state: 'output-error',
                toolCallId: 'call1',
                input: { operation: 'add', numbers: [1, 2] },
                errorText: 'Error: Invalid input',
              },
            ],
          },
        ]);

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Let me calculate that for you.",
                "type": "text",
              },
              {
                "input": {
                  "numbers": [
                    1,
                    2,
                  ],
                  "operation": "add",
                },
                "providerExecuted": undefined,
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "error-text",
                  "value": "Error: Invalid input",
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
      });
    });

    it('should handle assistant message with provider-executed tool output available', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'text',
              text: 'Let me calculate that for you.',
              state: 'done',
            },
            {
              type: 'tool-calculator',
              state: 'output-available',
              toolCallId: 'call1',
              input: { operation: 'add', numbers: [1, 2] },
              output: '3',
              providerExecuted: true,
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Let me calculate that for you.",
                "type": "text",
              },
              {
                "input": {
                  "numbers": [
                    1,
                    2,
                  ],
                  "operation": "add",
                },
                "providerExecuted": true,
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
              {
                "output": {
                  "type": "text",
                  "value": "3",
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should handle assistant message with provider-executed tool output error', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'text',
              text: 'Let me calculate that for you.',
              state: 'done',
            },
            {
              type: 'tool-calculator',
              state: 'output-error',
              toolCallId: 'call1',
              input: { operation: 'add', numbers: [1, 2] },
              errorText: 'Error: Invalid input',
              providerExecuted: true,
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Let me calculate that for you.",
                "type": "text",
              },
              {
                "input": {
                  "numbers": [
                    1,
                    2,
                  ],
                  "operation": "add",
                },
                "providerExecuted": true,
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-call",
              },
              {
                "output": {
                  "type": "error-json",
                  "value": "Error: Invalid input",
                },
                "toolCallId": "call1",
                "toolName": "calculator",
                "type": "tool-result",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should handle assistant message with tool invocations that have multi-part responses', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'text',
              text: 'Let me calculate that for you.',
              state: 'done',
            },
            {
              type: 'tool-screenshot',
              state: 'output-available',
              toolCallId: 'call1',
              input: {},
              output: 'imgbase64',
            },
          ],
        },
      ]);

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
          parts: [{ type: 'text', text: 'text2', state: 'done' }],
        },
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with multiple tool invocations that have step information', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            { type: 'text', text: 'response', state: 'done' },
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
      ]);

      expect(result).toMatchSnapshot();
    });

    it('should handle conversation with mix of tool invocations and text', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            { type: 'text', text: 'i am gonna use tool1', state: 'done' },
            {
              type: 'tool-screenshot',
              state: 'output-available',
              toolCallId: 'call-1',
              input: { value: 'value-1' },
              output: 'result-1',
            },
            { type: 'step-start' },
            {
              type: 'text',
              text: 'i am gonna use tool2 and tool3',
              state: 'done',
            },
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
            { type: 'text', text: 'final response', state: 'done' },
          ],
        },
      ]);

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
          parts: [
            { type: 'text', text: "I'll check that for you.", state: 'done' },
          ],
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
      const result = convertToModelMessages([
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
            { type: 'text', text: 'response', state: 'done' },
          ],
        },
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Thanks!' }],
        },
      ]);

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

  describe('when ignoring incomplete tool calls', () => {
    it('should handle conversation with multiple tool invocations and user message at the end', () => {
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
                state: 'input-streaming',
                toolCallId: 'call-2',
                input: { value: 'value-2' },
              },
              {
                type: 'tool-screenshot',
                state: 'input-available',
                toolCallId: 'call-3',
                input: { value: 'value-3' },
              },
              {
                type: 'dynamic-tool',
                toolName: 'tool-screenshot2',
                state: 'input-available',
                toolCallId: 'call-3',
                input: { value: 'value-3' },
              },
              { type: 'text', text: 'response', state: 'done' },
            ],
          },
          {
            role: 'user',
            parts: [{ type: 'text', text: 'Thanks!' }],
          },
        ],
        { ignoreIncompleteToolCalls: true },
      );

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "value": "value-1",
                },
                "providerExecuted": undefined,
                "toolCallId": "call-1",
                "toolName": "screenshot",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "text",
                  "value": "result-1",
                },
                "toolCallId": "call-1",
                "toolName": "screenshot",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
          {
            "content": [
              {
                "text": "response",
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
  });

  describe('when converting dynamic tool invocations', () => {
    it('should convert a dynamic tool invocation', () => {
      const result = convertToModelMessages(
        [
          {
            role: 'assistant',
            parts: [
              { type: 'step-start' },
              {
                type: 'dynamic-tool',
                toolName: 'screenshot',
                state: 'output-available',
                toolCallId: 'call-1',
                input: { value: 'value-1' },
                output: 'result-1',
              },
            ],
          },
          {
            role: 'user',
            parts: [{ type: 'text', text: 'Thanks!' }],
          },
        ],
        { ignoreIncompleteToolCalls: true },
      );

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "value": "value-1",
                },
                "toolCallId": "call-1",
                "toolName": "screenshot",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "text",
                  "value": "result-1",
                },
                "toolCallId": "call-1",
                "toolName": "screenshot",
                "type": "tool-result",
              },
            ],
            "role": "tool",
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

    it('should propagate provider metadata to dynamic tool-result', () => {
      const result = convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            { type: 'step-start' },
            {
              type: 'dynamic-tool',
              toolName: 'custom-tool',
              state: 'output-available',
              toolCallId: 'call-dynamic-1',
              input: { param: 'test' },
              output: 'dynamic-result',
              callProviderMetadata: {
                testProvider: {
                  dynamicToolExecution: true,
                },
              },
            },
          ],
        },
      ]);

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "input": {
                  "param": "test",
                },
                "providerOptions": {
                  "testProvider": {
                    "dynamicToolExecution": true,
                  },
                },
                "toolCallId": "call-dynamic-1",
                "toolName": "custom-tool",
                "type": "tool-call",
              },
            ],
            "role": "assistant",
          },
          {
            "content": [
              {
                "output": {
                  "type": "text",
                  "value": "dynamic-result",
                },
                "providerOptions": {
                  "testProvider": {
                    "dynamicToolExecution": true,
                  },
                },
                "toolCallId": "call-dynamic-1",
                "toolName": "custom-tool",
                "type": "tool-result",
              },
            ],
            "role": "tool",
          },
        ]
      `);
    });
  });

  describe('data part conversion', () => {
    describe('in user messages', () => {
      it('should convert data parts to text when converter provided', () => {
        const result = convertToModelMessages<
          UIMessage<unknown, { url: { url: string; content: string } }>
        >(
          [
            {
              role: 'user',
              parts: [
                {
                  type: 'data-url',
                  data: { url: 'https://example.com', content: 'Article text' },
                },
              ],
            },
          ],
          {
            convertDataPart: part => ({
              type: 'text',
              text: `\n\n[${part.data.url}]\n${part.data.content}`,
            }),
          },
        );

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "

        [https://example.com]
        Article text",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
      });

      it('should skip data parts when no converter provided', () => {
        const result = convertToModelMessages([
          {
            role: 'user',
            parts: [
              { type: 'text', text: 'Hello' },
              { type: 'data-url', data: { url: 'https://example.com' } },
            ],
          },
        ]);

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
      });

      it('should selectively convert data parts', () => {
        const result = convertToModelMessages<
          UIMessage<
            unknown,
            {
              url: { url: string };
              'ui-state': { enabled: boolean };
            }
          >
        >(
          [
            {
              role: 'user',
              parts: [
                { type: 'data-url', data: { url: 'https://example.com' } },
                { type: 'data-ui-state', data: { enabled: true } },
              ],
            },
          ],
          {
            convertDataPart: part => {
              // Include URLs, skip UI state
              if (part.type === 'data-url') {
                return { type: 'text', text: part.data.url };
              }
            },
          },
        );

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "https://example.com",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
      });

      it('should convert data parts to file parts', () => {
        const result = convertToModelMessages<
          UIMessage<
            unknown,
            {
              attachment: { mediaType: string; filename: string; data: string };
            }
          >
        >(
          [
            {
              role: 'user',
              parts: [
                { type: 'text', text: 'Check this file' },
                {
                  type: 'data-attachment',
                  data: {
                    mediaType: 'application/pdf',
                    filename: 'document.pdf',
                    data: 'base64data',
                  },
                },
              ],
            },
          ],
          {
            convertDataPart: part => {
              if (part.type === 'data-attachment') {
                return {
                  type: 'file',
                  mediaType: part.data.mediaType,
                  filename: part.data.filename,
                  data: part.data.data,
                };
              }
            },
          },
        );

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Check this file",
                "type": "text",
              },
              {
                "data": "base64data",
                "filename": "document.pdf",
                "mediaType": "application/pdf",
                "type": "file",
              },
            ],
            "role": "user",
          },
        ]
      `);
      });

      it('should handle multiple data parts of different types', () => {
        const result = convertToModelMessages<
          UIMessage<
            never,
            {
              url: { url: string; title: string };
              code: { code: string; language: string };
              note: { text: string };
            }
          >
        >(
          [
            {
              role: 'user',
              parts: [
                { type: 'text', text: 'Review these:' },
                {
                  type: 'data-url',
                  data: { url: 'https://example.com', title: 'Example' },
                },
                {
                  type: 'data-code',
                  data: { code: 'console.log("test")', language: 'javascript' },
                },
                {
                  type: 'data-note',
                  data: { text: 'Internal note' },
                },
              ],
            },
          ],
          {
            convertDataPart: part => {
              switch (part.type) {
                case 'data-url':
                  return {
                    type: 'text',
                    text: `[${part.data.title}](${part.data.url})`,
                  };
                case 'data-code':
                  return {
                    type: 'text',
                    text: `\`\`\`${part.data.language}\n${part.data.code}\n\`\`\``,
                  };
              }
            },
          },
        );

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Review these:",
                "type": "text",
              },
              {
                "text": "[Example](https://example.com)",
                "type": "text",
              },
              {
                "text": "\`\`\`javascript
        console.log("test")
        \`\`\`",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
      });

      it('should work with messages that have no data parts', () => {
        const result = convertToModelMessages(
          [
            {
              role: 'user',
              parts: [
                { type: 'text', text: 'Hello' },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            },
          ],
          {
            convertDataPart: () => ({ type: 'text', text: 'converted' }),
          },
        );

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "text",
              },
              {
                "data": "https://example.com/image.png",
                "filename": undefined,
                "mediaType": "image/png",
                "type": "file",
              },
            ],
            "role": "user",
          },
        ]
      `);
      });

      it('should preserve order of parts including converted data parts', () => {
        const result = convertToModelMessages<
          UIMessage<unknown, { tag: { value: string } }>
        >(
          [
            {
              role: 'user',
              parts: [
                { type: 'text', text: 'First' },
                { type: 'data-tag', data: { value: 'tag1' } },
                { type: 'text', text: 'Second' },
                { type: 'data-tag', data: { value: 'tag2' } },
                { type: 'text', text: 'Third' },
              ],
            },
          ],
          {
            convertDataPart: part => ({
              type: 'text',
              text: `[${part.data.value}]`,
            }),
          },
        );

        expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "First",
                "type": "text",
              },
              {
                "text": "[tag1]",
                "type": "text",
              },
              {
                "text": "Second",
                "type": "text",
              },
              {
                "text": "[tag2]",
                "type": "text",
              },
              {
                "text": "Third",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
      });
    });

    describe('in assistant messages', () => {
      it('should convert data parts to text when converter provided', () => {
        const result = convertToModelMessages<
          UIMessage<unknown, { url: { url: string; content: string } }>
        >(
          [
            {
              role: 'assistant',
              parts: [
                {
                  type: 'data-url',
                  data: { url: 'https://example.com', content: 'Article text' },
                },
              ],
            },
          ],
          {
            convertDataPart: part => ({
              type: 'text',
              text: `\n\n[${part.data.url}]\n${part.data.content}`,
            }),
          },
        );

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "

          [https://example.com]
          Article text",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should skip data parts when no converter provided', () => {
        const result = convertToModelMessages([
          {
            role: 'assistant',
            parts: [
              { type: 'text', text: 'Hello' },
              { type: 'data-url', data: { url: 'https://example.com' } },
            ],
          },
        ]);

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should selectively convert data parts', () => {
        const result = convertToModelMessages<
          UIMessage<
            unknown,
            {
              url: { url: string };
              'ui-state': { enabled: boolean };
            }
          >
        >(
          [
            {
              role: 'assistant',
              parts: [
                { type: 'data-url', data: { url: 'https://example.com' } },
                { type: 'data-ui-state', data: { enabled: true } },
              ],
            },
          ],
          {
            convertDataPart: part => {
              // Include URLs, skip UI state
              if (part.type === 'data-url') {
                return { type: 'text', text: part.data.url };
              }
            },
          },
        );

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "https://example.com",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should convert data parts to file parts', () => {
        const result = convertToModelMessages<
          UIMessage<
            unknown,
            {
              attachment: { mediaType: string; filename: string; data: string };
            }
          >
        >(
          [
            {
              role: 'assistant',
              parts: [
                { type: 'text', text: 'Check this file' },
                {
                  type: 'data-attachment',
                  data: {
                    mediaType: 'application/pdf',
                    filename: 'document.pdf',
                    data: 'base64data',
                  },
                },
              ],
            },
          ],
          {
            convertDataPart: part => {
              if (part.type === 'data-attachment') {
                return {
                  type: 'file',
                  mediaType: part.data.mediaType,
                  filename: part.data.filename,
                  data: part.data.data,
                };
              }
            },
          },
        );

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Check this file",
                  "type": "text",
                },
                {
                  "data": "base64data",
                  "filename": "document.pdf",
                  "mediaType": "application/pdf",
                  "type": "file",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should handle multiple data parts of different types', () => {
        const result = convertToModelMessages<
          UIMessage<
            never,
            {
              url: { url: string; title: string };
              code: { code: string; language: string };
              note: { text: string };
            }
          >
        >(
          [
            {
              role: 'assistant',
              parts: [
                { type: 'text', text: 'Review these:' },
                {
                  type: 'data-url',
                  data: { url: 'https://example.com', title: 'Example' },
                },
                {
                  type: 'data-code',
                  data: { code: 'console.log("test")', language: 'javascript' },
                },
                {
                  type: 'data-note',
                  data: { text: 'Internal note' },
                },
              ],
            },
          ],
          {
            convertDataPart: part => {
              switch (part.type) {
                case 'data-url':
                  return {
                    type: 'text',
                    text: `[${part.data.title}](${part.data.url})`,
                  };
                case 'data-code':
                  return {
                    type: 'text',
                    text: `\`\`\`${part.data.language}\n${part.data.code}\n\`\`\``,
                  };
              }
            },
          },
        );

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Review these:",
                  "type": "text",
                },
                {
                  "text": "[Example](https://example.com)",
                  "type": "text",
                },
                {
                  "text": "\`\`\`javascript
          console.log("test")
          \`\`\`",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should work with messages that have no data parts', () => {
        const result = convertToModelMessages(
          [
            {
              role: 'assistant',
              parts: [
                { type: 'text', text: 'Hello' },
                {
                  type: 'file',
                  mediaType: 'image/png',
                  url: 'https://example.com/image.png',
                },
              ],
            },
          ],
          {
            convertDataPart: () => ({ type: 'text', text: 'converted' }),
          },
        );

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
                {
                  "data": "https://example.com/image.png",
                  "filename": undefined,
                  "mediaType": "image/png",
                  "type": "file",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should preserve order of parts including converted data parts', () => {
        const result = convertToModelMessages<
          UIMessage<unknown, { tag: { value: string } }>
        >(
          [
            {
              role: 'assistant',
              parts: [
                { type: 'text', text: 'First' },
                { type: 'data-tag', data: { value: 'tag1' } },
                { type: 'text', text: 'Second' },
                { type: 'data-tag', data: { value: 'tag2' } },
                { type: 'text', text: 'Third' },
              ],
            },
          ],
          {
            convertDataPart: part => ({
              type: 'text',
              text: `[${part.data.value}]`,
            }),
          },
        );

        expect(result).toMatchInlineSnapshot(`
          [
            {
              "content": [
                {
                  "text": "First",
                  "type": "text",
                },
                {
                  "text": "[tag1]",
                  "type": "text",
                },
                {
                  "text": "Second",
                  "type": "text",
                },
                {
                  "text": "[tag2]",
                  "type": "text",
                },
                {
                  "text": "Third",
                  "type": "text",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });
    });
  });
});

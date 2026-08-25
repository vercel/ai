import {
  InvalidPromptError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { convertToDeepSeekChatMessages } from './convert-to-deepseek-chat-messages';
import { describe, it, expect } from 'vitest';

describe('convertToDeepSeekChatMessages', () => {
  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should convert image data to an image URL content part', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'file',
                data: Buffer.from([0, 1, 2, 3]).toString('base64'),
                mediaType: 'image/png',
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
                {
                  "image_url": {
                    "url": "data:image/png;base64,AAECAw==",
                  },
                  "type": "image_url",
                },
              ],
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should convert an image URL to an image URL content part', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'file',
                data: new URL('https://example.com/image.png'),
                mediaType: 'image/png',
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-v4-flash-vision-exp',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": [
                {
                  "text": "Hello",
                  "type": "text",
                },
                {
                  "image_url": {
                    "url": "https://example.com/image.png",
                  },
                  "type": "image_url",
                },
              ],
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should pass imageDetail to image URL content parts', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: new URL('https://example.com/image.webp'),
                mediaType: 'image/webp',
                providerOptions: {
                  deepseek: { imageDetail: 'low' },
                },
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-v4-flash-vision-exp',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: 'https://example.com/image.webp',
                detail: 'low',
              },
            },
          ],
        },
      ]);
    });

    it('should convert inline image data to file_data and preserve its filename', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: new Uint8Array([0, 1, 2, 3]),
                filename: 'sample.jpg',
                mediaType: 'image/jpg',
                providerOptions: {
                  deepseek: { fileData: true },
                },
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-v4-flash-vision-exp',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              file_data: 'data:image/jpeg;base64,AAECAw==',
              filename: 'sample.jpg',
            },
          ],
        },
      ]);
    });

    it('should reject imageDetail together with fileData', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: new Uint8Array([0, 1, 2, 3]),
                  mediaType: 'image/png',
                  providerOptions: {
                    deepseek: { fileData: true, imageDetail: 'high' },
                  },
                },
              ],
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-v4-flash-vision-exp',
        }),
      ).rejects.toThrow(
        'DeepSeek `imageDetail` cannot be combined with `fileData`.',
      );
    });

    it('should reject image URLs longer than 8192 characters', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: new URL(`https://example.com/${'a'.repeat(8192)}`),
                  mediaType: 'image/png',
                },
              ],
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-v4-flash-vision-exp',
        }),
      ).rejects.toThrow('DeepSeek image URLs must not exceed 8192 characters.');
    });

    it('should reject unsupported image formats', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: new Uint8Array([0, 1, 2, 3]),
                  mediaType: 'image/svg+xml',
                },
              ],
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-v4-flash-vision-exp',
        }),
      ).rejects.toThrow(
        'DeepSeek supports JPEG, PNG, GIF, and WebP image inputs.',
      );
    });

    it('should warn about unsupported non-image file parts', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'file',
                data: Buffer.from([0, 1, 2, 3]).toString('base64'),
                mediaType: 'application/pdf',
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
          ],
          "warnings": [
            {
              "feature": "user message part type: file",
              "type": "unsupported",
            },
          ],
        }
      `);
    });
  });

  describe('tool calls', () => {
    it('should stringify arguments to tool calls', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                input: { foo: 'bar123' },
                toolCallId: 'quux',
                toolName: 'thwomp',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'quux',
                toolName: 'thwomp',
                output: { type: 'json', value: { oof: '321rab' } },
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "",
              "reasoning_content": undefined,
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"foo":"bar123"}",
                    "name": "thwomp",
                  },
                  "id": "quux",
                  "type": "function",
                },
              ],
            },
            {
              "content": "{"oof":"321rab"}",
              "role": "tool",
              "tool_call_id": "quux",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should handle text output type in tool results', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                input: { query: 'weather' },
                toolCallId: 'call-1',
                toolName: 'getWeather',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'getWeather',
                output: { type: 'text', value: 'It is sunny today' },
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "",
              "reasoning_content": undefined,
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"query":"weather"}",
                    "name": "getWeather",
                  },
                  "id": "call-1",
                  "type": "function",
                },
              ],
            },
            {
              "content": "It is sunny today",
              "role": "tool",
              "tool_call_id": "call-1",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should support reasoning content in tool calls', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'I think the tool will return the correct value.',
              },
              {
                type: 'tool-call',
                input: { foo: 'bar123' },
                toolCallId: 'quux',
                toolName: 'thwomp',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'quux',
                toolName: 'thwomp',
                output: { type: 'json', value: { oof: '321rab' } },
              },
            ],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
            {
              "content": "",
              "reasoning_content": "I think the tool will return the correct value.",
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"foo":"bar123"}",
                    "name": "thwomp",
                  },
                  "id": "quux",
                  "type": "function",
                },
              ],
            },
            {
              "content": "{"oof":"321rab"}",
              "role": "tool",
              "tool_call_id": "quux",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should filter out reasoning content from turns before the last user message', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'I think the tool will return the correct value.',
              },
              {
                type: 'tool-call',
                input: { foo: 'bar123' },
                toolCallId: 'quux',
                toolName: 'thwomp',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'quux',
                toolName: 'thwomp',
                output: { type: 'json', value: { oof: '321rab' } },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Goodbye' }],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
            {
              "content": "",
              "reasoning_content": undefined,
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"foo":"bar123"}",
                    "name": "thwomp",
                  },
                  "id": "quux",
                  "type": "function",
                },
              ],
            },
            {
              "content": "{"oof":"321rab"}",
              "role": "tool",
              "tool_call_id": "quux",
            },
            {
              "content": "Goodbye",
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });
  });

  describe('deepseek-v4 thinking mode', () => {
    // V4 demands `reasoning_content` on every assistant turn — including ones
    // before the last user message. Stripping it like we do for R1 makes the
    // API reject multi-turn requests with "The `reasoning_content` in the
    // thinking mode must be passed back to the API."
    it('should preserve reasoning_content from prior turns for deepseek-v4', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'I think the tool will return the correct value.',
              },
              {
                type: 'tool-call',
                input: { foo: 'bar123' },
                toolCallId: 'quux',
                toolName: 'thwomp',
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'quux',
                toolName: 'thwomp',
                output: { type: 'json', value: { oof: '321rab' } },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Goodbye' }],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-v4-pro',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
            {
              "content": "",
              "reasoning_content": "I think the tool will return the correct value.",
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"foo":"bar123"}",
                    "name": "thwomp",
                  },
                  "id": "quux",
                  "type": "function",
                },
              ],
            },
            {
              "content": "{"oof":"321rab"}",
              "role": "tool",
              "tool_call_id": "quux",
            },
            {
              "content": "Goodbye",
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should back-fill empty reasoning_content for deepseek-v4 assistant messages with no reasoning part', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hi there' }],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'Again' }],
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-v4-pro',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "Hello",
              "role": "user",
            },
            {
              "content": "Hi there",
              "reasoning_content": "",
              "role": "assistant",
              "tool_calls": undefined,
            },
            {
              "content": "Again",
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });
  });

  describe('assistant prefix completion', () => {
    it('should serialize prefix true on the final assistant message', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Complete this sentence.' }],
          },
          {
            role: 'assistant',
            content: [{ type: 'text', text: 'The answer is' }],
            providerOptions: {
              deepseek: {
                prefix: true,
              },
            },
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
        supportsAssistantPrefixCompletion: true,
      });

      expect(result).toStrictEqual({
        messages: [
          {
            role: 'user',
            content: 'Complete this sentence.',
          },
          {
            role: 'assistant',
            content: 'The answer is',
            prefix: true,
            reasoning_content: undefined,
            tool_calls: undefined,
          },
        ],
        warnings: [],
      });
    });

    it('should reject prefix completion on a non-assistant message', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Complete this sentence.' }],
              providerOptions: {
                deepseek: {
                  prefix: true,
                },
              },
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-chat',
          supportsAssistantPrefixCompletion: true,
        }),
      ).rejects.toSatisfy(InvalidPromptError.isInstance);
    });

    it('should reject prefix completion on a non-final assistant message', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'The answer is' }],
              providerOptions: {
                deepseek: {
                  prefix: true,
                },
              },
            },
            {
              role: 'user',
              content: [{ type: 'text', text: 'Continue.' }],
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-chat',
          supportsAssistantPrefixCompletion: true,
        }),
      ).rejects.toSatisfy(InvalidPromptError.isInstance);
    });

    it('should reject prefix completion without a beta base URL capability', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'assistant',
              content: [{ type: 'text', text: 'The answer is' }],
              providerOptions: {
                deepseek: {
                  prefix: true,
                },
              },
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-chat',
        }),
      ).rejects.toSatisfy(UnsupportedFunctionalityError.isInstance);
    });
  });
});

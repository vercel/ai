import {
  InvalidPromptError,
  NoSuchProviderReferenceError,
  UnsupportedFunctionalityError,
} from '@ai-sdk/provider';
import { describe, it, expect } from 'vitest';
import { convertToDeepSeekChatMessages } from './convert-to-deepseek-chat-messages';

describe('convertToDeepSeekChatMessages', () => {
  describe('message names', () => {
    it('should serialize names for system, user, and assistant messages', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'system',
            content: 'You are a helpful assistant.',
            providerOptions: {
              deepseek: { name: 'guide' },
            },
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Describe this image.' },
              {
                type: 'file',
                data: {
                  type: 'url',
                  url: new URL('https://example.com/image.png'),
                },
                mediaType: 'image/png',
              },
            ],
            providerOptions: {
              deepseek: { name: 'alice' },
            },
          },
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I will inspect it.' },
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'inspectImage',
                input: { detail: 'high' },
              },
            ],
            providerOptions: {
              deepseek: { name: 'vision_assistant' },
            },
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-v4-flash-vision-exp',
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": "You are a helpful assistant.",
              "name": "guide",
              "role": "system",
            },
            {
              "content": [
                {
                  "text": "Describe this image.",
                  "type": "text",
                },
                {
                  "image_url": {
                    "url": "https://example.com/image.png",
                  },
                  "type": "image_url",
                },
              ],
              "name": "alice",
              "role": "user",
            },
            {
              "content": "I will inspect it.",
              "name": "vision_assistant",
              "reasoning_content": "",
              "role": "assistant",
              "tool_calls": [
                {
                  "function": {
                    "arguments": "{"detail":"high"}",
                    "name": "inspectImage",
                  },
                  "id": "call-1",
                  "type": "function",
                },
              ],
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should ignore a name on a tool message with an unsupported warning', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'weather',
                output: { type: 'text', value: 'sunny' },
              },
            ],
            providerOptions: {
              deepseek: { name: 'weather_tool' },
            },
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
      });

      expect(result).toEqual({
        messages: [
          {
            role: 'tool',
            tool_call_id: 'call-1',
            content: 'sunny',
          },
        ],
        warnings: [
          {
            type: 'unsupported',
            feature: 'message name on tool messages',
          },
        ],
      });
    });

    it('should reject a non-string name', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'user',
              content: [{ type: 'text', text: 'Hello' }],
              providerOptions: {
                deepseek: { name: 123 },
              },
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-chat',
        }),
      ).rejects.toThrow('invalid deepseek provider options');
    });

    it('should serialize a name from a custom provider options namespace', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
            providerOptions: {
              azure: { name: 'alice' },
            },
          },
        ],
        responseFormat: undefined,
        modelId: 'deepseek-chat',
        providerOptionsName: 'azure',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: 'Hello',
          name: 'alice',
        },
      ]);
    });
  });

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
                data: {
                  type: 'data' as const,
                  data: Buffer.from([0, 1, 2, 3]).toString('base64'),
                },
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
                data: {
                  type: 'url' as const,
                  url: new URL('https://example.com/image.png'),
                },
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
                data: {
                  type: 'url' as const,
                  url: new URL('https://example.com/image.webp'),
                },
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
                data: {
                  type: 'data' as const,
                  data: new Uint8Array([0, 1, 2, 3]),
                },
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
                  data: {
                    type: 'data' as const,
                    data: new Uint8Array([0, 1, 2, 3]),
                  },
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
                  data: {
                    type: 'url' as const,
                    url: new URL(`https://example.com/${'a'.repeat(8192)}`),
                  },
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
                  data: {
                    type: 'data' as const,
                    data: new Uint8Array([0, 1, 2, 3]),
                  },
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

    it('should convert an image provider reference to a file content part', async () => {
      const result = await convertToDeepSeekChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'file',
                data: {
                  type: 'reference',
                  reference: {
                    deepseek: 'file-api-deepseek',
                    openai: 'file-openai',
                  },
                },
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
                  "file_id": "file-api-deepseek",
                  "type": "file",
                },
              ],
              "role": "user",
            },
          ],
          "warnings": [],
        }
      `);
    });

    it('should throw when an image reference has no DeepSeek identifier', async () => {
      await expect(
        convertToDeepSeekChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: {
                    type: 'reference',
                    reference: { openai: 'file-openai' },
                  },
                  mediaType: 'image/png',
                },
              ],
            },
          ],
          responseFormat: undefined,
          modelId: 'deepseek-v4-flash-vision-exp',
        }),
      ).rejects.toThrow(NoSuchProviderReferenceError);
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
                data: {
                  type: 'data' as const,
                  data: Buffer.from([0, 1, 2, 3]).toString('base64'),
                },
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

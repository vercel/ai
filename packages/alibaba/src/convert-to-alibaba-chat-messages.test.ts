import { describe, it, expect } from 'vitest';
import { convertToAlibabaChatMessages } from './convert-to-alibaba-chat-messages';
import { CacheControlValidator } from './get-cache-control';

describe('convertToAlibabaChatMessages', () => {
  it('should use string format for single text user message', () => {
    const result = convertToAlibabaChatMessages({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "Hello",
          "role": "user",
        },
      ]
    `);
  });

  it('should use array format for multi-part user message with image', () => {
    const result = convertToAlibabaChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'file',
              data: new Uint8Array([0, 1, 2, 3]),
              mediaType: 'image/png',
            },
          ],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "What is in this image?",
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
      ]
    `);
  });

  it('should convert assistant message with tool calls', () => {
    const result = convertToAlibabaChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'get_weather',
              input: { location: 'San Francisco' },
            },
          ],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": null,
          "role": "assistant",
          "tool_calls": [
            {
              "function": {
                "arguments": "{"location":"San Francisco"}",
                "name": "get_weather",
              },
              "id": "call-1",
              "type": "function",
            },
          ],
        },
      ]
    `);
  });

  it('should convert tool results', () => {
    const result = convertToAlibabaChatMessages({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'get_weather',
              output: {
                type: 'json',
                value: { temperature: 72, condition: 'sunny' },
              },
            },
          ],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "{"temperature":72,"condition":"sunny"}",
          "role": "tool",
          "tool_call_id": "call-1",
        },
      ]
    `);
  });

  it('should inject cache control into system message content block', () => {
    const validator = new CacheControlValidator();

    const result = convertToAlibabaChatMessages({
      prompt: [
        {
          role: 'system',
          content: 'You are a helpful assistant.',
          providerOptions: {
            alibaba: {
              cacheControl: { type: 'ephemeral' },
            },
          },
        },
      ],
      cacheControlValidator: validator,
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "cache_control": {
                "type": "ephemeral",
              },
              "text": "You are a helpful assistant.",
              "type": "text",
            },
          ],
          "role": "system",
        },
      ]
    `);
  });
});

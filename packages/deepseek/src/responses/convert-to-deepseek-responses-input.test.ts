import type {
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';
import { describe, expect, it } from 'vitest';
import { convertToDeepSeekResponsesInput } from './convert-to-deepseek-responses-input';

function convert(prompt: LanguageModelV4Prompt) {
  return convertToDeepSeekResponsesInput({
    prompt,
    providerOptionsName: 'deepseek',
  });
}

describe('convertToDeepSeekResponsesInput', () => {
  it('should collect system messages into instructions', () => {
    expect(
      convert([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'system', content: 'Answer in English.' },
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ]),
    ).toMatchInlineSnapshot(`
      {
        "input": [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
            "type": "message",
          },
        ],
        "instructions": "You are a helpful assistant.
      Answer in English.",
        "warnings": [],
      }
    `);
  });

  it('should convert image parts into input_image content', () => {
    const { input, warnings } = convert([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in these images?' },
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'url', url: new URL('https://example.com/a.png') },
          },
          {
            type: 'file',
            mediaType: 'image/png',
            data: {
              type: 'data',
              data: Buffer.from([0, 1, 2, 3]).toString('base64'),
            },
          },
          {
            type: 'file',
            mediaType: 'image/png',
            data: {
              type: 'reference',
              reference: { deepseek: 'file-api-1234567890' },
            },
          },
        ],
      },
    ]);

    expect(input).toStrictEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'What is in these images?' },
          { type: 'input_image', image_url: 'https://example.com/a.png' },
          {
            type: 'input_image',
            image_url: 'data:image/png;base64,AAECAw==',
          },
          { type: 'input_image', file_id: 'file-api-1234567890' },
        ],
      },
    ]);
    expect(warnings).toStrictEqual([]);
  });

  it('should warn about unsupported user message parts', () => {
    const { input, warnings } = convert([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'What is in this file?' },
          {
            type: 'file',
            mediaType: 'application/pdf',
            data: { type: 'url', url: new URL('https://example.com/a.pdf') },
          },
        ],
      },
    ]);

    expect(input).toStrictEqual([
      {
        type: 'message',
        role: 'user',
        content: [{ type: 'input_text', text: 'What is in this file?' }],
      },
    ]);
    expect(warnings).toStrictEqual([
      { type: 'unsupported', feature: 'user message part type: file' },
    ]);
  });

  it('should send reasoning ahead of the assistant message it belongs to', () => {
    expect(
      convert([
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'reasoning',
              text: 'The user greeted me.',
              providerOptions: { deepseek: { itemId: 'reasoning-1' } },
            },
            { type: 'text', text: 'Hi!' },
          ],
        },
      ]).input,
    ).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "Hello",
              "type": "input_text",
            },
          ],
          "role": "user",
          "type": "message",
        },
        {
          "content": [
            {
              "text": "The user greeted me.",
              "type": "reasoning_text",
            },
          ],
          "id": "reasoning-1",
          "summary": [],
          "type": "reasoning",
        },
        {
          "content": [
            {
              "text": "Hi!",
              "type": "output_text",
            },
          ],
          "role": "assistant",
          "type": "message",
        },
      ]
    `);
  });

  it('should omit the reasoning id when the part carries no item id', () => {
    expect(
      convert([
        {
          role: 'assistant',
          content: [{ type: 'reasoning', text: 'Thinking.' }],
        },
      ]).input,
    ).toStrictEqual([
      {
        type: 'reasoning',
        summary: [],
        content: [{ type: 'reasoning_text', text: 'Thinking.' }],
      },
    ]);
  });

  it('should convert tool calls and tool results', () => {
    expect(
      convert([
        { role: 'user', content: [{ type: 'text', text: 'Weather?' }] },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'weather',
              input: { location: 'San Francisco' },
              providerOptions: { deepseek: { itemId: 'item-1' } },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'weather',
              output: { type: 'json', value: { temperature: 18 } },
            },
          ],
        },
      ]).input,
    ).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "Weather?",
              "type": "input_text",
            },
          ],
          "role": "user",
          "type": "message",
        },
        {
          "arguments": "{"location":"San Francisco"}",
          "call_id": "call-1",
          "id": "item-1",
          "name": "weather",
          "type": "function_call",
        },
        {
          "call_id": "call-1",
          "output": "{"temperature":18}",
          "type": "function_call_output",
        },
      ]
    `);
  });

  it.each([
    [
      {
        type: 'text',
        value: 'sunny',
      } satisfies LanguageModelV4ToolResultOutput,
      'sunny',
    ],
    [
      {
        type: 'error-text',
        value: 'boom',
      } satisfies LanguageModelV4ToolResultOutput,
      'boom',
    ],
    [
      {
        type: 'json',
        value: { a: 1 },
      } satisfies LanguageModelV4ToolResultOutput,
      '{"a":1}',
    ],
    [
      {
        type: 'error-json',
        value: { a: 1 },
      } satisfies LanguageModelV4ToolResultOutput,
      '{"a":1}',
    ],
    [
      {
        type: 'execution-denied',
        reason: 'nope',
      } satisfies LanguageModelV4ToolResultOutput,
      'nope',
    ],
    [
      { type: 'execution-denied' } satisfies LanguageModelV4ToolResultOutput,
      'Tool call execution denied.',
    ],
    [
      {
        type: 'content',
        value: [
          { type: 'text', text: 'a' },
          { type: 'text', text: 'b' },
        ],
      } satisfies LanguageModelV4ToolResultOutput,
      'ab',
    ],
  ])('should stringify %s tool output', (output, expected) => {
    const { input } = convert([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'weather',
            output,
          },
        ],
      },
    ]);

    expect(input).toStrictEqual([
      {
        type: 'function_call_output',
        call_id: 'call-1',
        output: expected,
      },
    ]);
  });

  it('should warn about unsupported tool result content parts', () => {
    const { warnings } = convert([
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'screenshot',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: { type: 'data', data: 'AAAA' },
                },
              ],
            },
          },
        ],
      },
    ]);

    expect(warnings).toStrictEqual([
      { type: 'unsupported', feature: 'tool result content part type: file' },
    ]);
  });
});

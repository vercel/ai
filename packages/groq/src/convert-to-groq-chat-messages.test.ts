import { convertToGroqChatMessages } from './convert-to-groq-chat-messages';
import { describe, it, expect } from 'vitest';

describe('user messages', () => {
  it('should convert messages with image parts', async () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'file',
            data: { type: 'data' as const, data: 'AAECAw==' },
            mediaType: 'image/png',
          },
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

  it('should convert messages with image parts from Uint8Array', async () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hi' },
          {
            type: 'file',
            data: { type: 'data' as const, data: new Uint8Array([0, 1, 2, 3]) },
            mediaType: 'image/png',
          },
        ],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "Hi",
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

  it('should convert messages with only a text part to a string content', async () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "Hello",
          "role": "user",
        },
      ]
    `);
  });
});

describe('tool calls', () => {
  it('should stringify arguments to tool calls', () => {
    const result = convertToGroqChatMessages([
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
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "",
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
      ]
    `);
  });

  it('should send reasoning if present', () => {
    const result = convertToGroqChatMessages([
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
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "",
          "reasoning": "I think the tool will return the correct value.",
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
      ]
    `);
  });

  it('should not include reasoning field when no reasoning content is present', () => {
    const result = convertToGroqChatMessages([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, how can I help you?' }],
      },
    ]);

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": "Hello, how can I help you?",
          "role": "assistant",
        },
      ]
    `);
  });

  it('should throw for file parts with provider references', () => {
    expect(() =>
      convertToGroqChatMessages([
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: {
                type: 'reference' as const,
                reference: { groq: 'file-ref-123' },
              },
              mediaType: 'image/png',
            },
          ],
        },
      ]),
    ).toThrow(
      "'file parts with provider references' functionality not supported",
    );
  });
});

describe('top-level-only media type resolution', () => {
  const pngBase64 = 'iVBORw0KGgo=';

  it('passes full image/png through unchanged for inline data', () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: { type: 'data', data: pngBase64 },
          },
        ],
      },
    ]);

    expect((result[0].content as unknown[])[0]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${pngBase64}` },
    });
  });

  it('detects image subtype from inline bytes for top-level "image"', () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image',
            data: { type: 'data', data: pngBase64 },
          },
        ],
      },
    ]);

    expect((result[0].content as unknown[])[0]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${pngBase64}` },
    });
  });

  it('passes through URL source for top-level-only image', () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image',
            data: {
              type: 'url',
              url: new URL('https://example.com/x.png'),
            },
          },
        ],
      },
    ]);

    expect((result[0].content as unknown[])[0]).toEqual({
      type: 'image_url',
      image_url: { url: 'https://example.com/x.png' },
    });
  });

  it('normalizes image/* wildcard via detection', () => {
    const result = convertToGroqChatMessages([
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/*',
            data: { type: 'data', data: pngBase64 },
          },
        ],
      },
    ]);

    expect((result[0].content as unknown[])[0]).toEqual({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${pngBase64}` },
    });
  });

  describe('tool argument and output serialization resilience', () => {
    it('preserves string tool call arguments without double-stringifying', () => {
      const result = convertToGroqChatMessages([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'search',
              input: '{"query":"fast lpu","limit":3}',
            },
          ],
        },
      ]);

      expect(result[0]).toEqual({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: 'search',
              arguments: '{"query":"fast lpu","limit":3}',
            },
          },
        ],
      });
    });

    it('safely serializes BigInt and circular structures in tool call arguments', () => {
      const cyclicInput: any = { id: 12345678901234567890n };
      cyclicInput.self = cyclicInput;

      const result = convertToGroqChatMessages([
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-2',
              toolName: 'process',
              input: cyclicInput,
            },
          ],
        },
      ]);

      const args = result[0].tool_calls?.[0].function.arguments;
      expect(args).toContain('"id":"12345678901234567890"');
      expect(args).toContain('"self":"[Circular]"');
    });

    it('safely serializes BigInt and circular structures in tool responses', () => {
      const cyclicOutput: any = { count: 999999999999999999n };
      cyclicOutput.self = cyclicOutput;

      const result = convertToGroqChatMessages([
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'call-3',
              toolName: 'getData',
              output: {
                type: 'json',
                value: cyclicOutput,
              },
            },
          ],
        },
      ]);

      const content = result[0].content as string;
      expect(content).toContain('"count":"999999999999999999"');
      expect(content).toContain('"self":"[Circular]"');
    });
  });
});

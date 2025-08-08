import { tool } from '@ai-sdk/provider-utils';
import z from 'zod/v4';
import { DefaultGeneratedFile } from './generated-file';
import { toResponseMessages } from './to-response-messages';

describe('toResponseMessages', () => {
  it('should return an assistant message with text when no tool calls or results', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Hello, world!',
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
        }),
      },
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello, world!' }],
      },
    ]);
  });

  it('should include tool calls in the assistant message', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Using a tool',
        },
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          input: {},
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
        }),
      },
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Using a tool' },
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'testTool',
            input: {},
          },
        ],
      },
    ]);
  });

  it('should include tool calls with metadata in the assistant message', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Using a tool',
        },
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          input: {},
          providerMetadata: {
            testProvider: {
              signature: 'sig',
            },
          },
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": undefined,
              "text": "Using a tool",
              "type": "text",
            },
            {
              "input": {},
              "providerExecuted": undefined,
              "providerOptions": {
                "testProvider": {
                  "signature": "sig",
                },
              },
              "toolCallId": "123",
              "toolName": "testTool",
              "type": "tool-call",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });

  it('should include tool results as a separate message', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Tool used',
        },
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          input: {},
        },
        {
          type: 'tool-result',
          toolCallId: '123',
          toolName: 'testTool',
          output: 'Tool result',
          input: {},
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": undefined,
              "text": "Tool used",
              "type": "text",
            },
            {
              "input": {},
              "providerExecuted": undefined,
              "providerOptions": undefined,
              "toolCallId": "123",
              "toolName": "testTool",
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
                "value": "Tool result",
              },
              "toolCallId": "123",
              "toolName": "testTool",
              "type": "tool-result",
            },
          ],
          "role": "tool",
        },
      ]
    `);
  });

  it('should include tool errors as a separate message', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Tool used',
        },
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          input: {},
        },
        {
          type: 'tool-error',
          toolCallId: '123',
          toolName: 'testTool',
          error: 'Tool error',
          input: {},
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": undefined,
              "text": "Tool used",
              "type": "text",
            },
            {
              "input": {},
              "providerExecuted": undefined,
              "providerOptions": undefined,
              "toolCallId": "123",
              "toolName": "testTool",
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
                "value": "Tool error",
              },
              "toolCallId": "123",
              "toolName": "testTool",
              "type": "tool-result",
            },
          ],
          "role": "tool",
        },
      ]
    `);
  });

  it('should handle undefined text', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'reasoning',
          text: 'Thinking text',
          providerMetadata: {
            testProvider: {
              signature: 'sig',
            },
          },
        },
      ],
      tools: {},
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": {
                "testProvider": {
                  "signature": "sig",
                },
              },
              "text": "Thinking text",
              "type": "reasoning",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });

  it('should include reasoning array with redacted reasoning in the assistant message', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'reasoning',
          text: 'redacted-data',
          providerMetadata: {
            testProvider: { isRedacted: true },
          },
        },
        {
          type: 'reasoning',
          text: 'Thinking text',
          providerMetadata: {
            testProvider: { signature: 'sig' },
          },
        },
        {
          type: 'text',
          text: 'Final text',
        },
      ],
      tools: {},
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": {
                "testProvider": {
                  "isRedacted": true,
                },
              },
              "text": "redacted-data",
              "type": "reasoning",
            },
            {
              "providerOptions": {
                "testProvider": {
                  "signature": "sig",
                },
              },
              "text": "Thinking text",
              "type": "reasoning",
            },
            {
              "providerOptions": undefined,
              "text": "Final text",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });

  it('should handle multipart tool results', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'multipart tool result',
        },
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          input: {},
        },
        {
          type: 'tool-result',
          toolCallId: '123',
          toolName: 'testTool',
          output: 'image-base64',
          input: {},
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
          toModelOutput: () => ({
            type: 'json',
            value: {
              proof: 'that toModelOutput is called',
            },
          }),
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": undefined,
              "text": "multipart tool result",
              "type": "text",
            },
            {
              "input": {},
              "providerExecuted": undefined,
              "providerOptions": undefined,
              "toolCallId": "123",
              "toolName": "testTool",
              "type": "tool-call",
            },
          ],
          "role": "assistant",
        },
        {
          "content": [
            {
              "output": {
                "type": "json",
                "value": {
                  "proof": "that toModelOutput is called",
                },
              },
              "toolCallId": "123",
              "toolName": "testTool",
              "type": "tool-result",
            },
          ],
          "role": "tool",
        },
      ]
    `);
  });

  it('should include images in the assistant message', () => {
    const pngFile = new DefaultGeneratedFile({
      data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      mediaType: 'image/png',
    });

    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Here is an image',
        },
        { type: 'file', file: pngFile },
      ],
      tools: {},
    });

    expect(result).toStrictEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Here is an image',
            providerOptions: undefined,
          },
          {
            type: 'file',
            data: pngFile.base64,
            mediaType: pngFile.mediaType,
            providerOptions: undefined,
          },
        ],
      },
    ]);
  });

  it('should handle multiple images in the assistant message', () => {
    const pngFile = new DefaultGeneratedFile({
      data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      mediaType: 'image/png',
    });
    const jpegFile = new DefaultGeneratedFile({
      data: new Uint8Array([255, 216, 255]),
      mediaType: 'image/jpeg',
    });

    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Here are multiple images',
        },
        { type: 'file', file: pngFile },
        { type: 'file', file: jpegFile },
      ],
      tools: {},
    });

    expect(result).toStrictEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Here are multiple images',
            providerOptions: undefined,
          },
          {
            type: 'file',
            data: pngFile.base64,
            mediaType: pngFile.mediaType,
            providerOptions: undefined,
          },
          {
            type: 'file',
            data: jpegFile.base64,
            mediaType: jpegFile.mediaType,
            providerOptions: undefined,
          },
        ],
      },
    ]);
  });

  it('should handle Uint8Array images', () => {
    const pngFile = new DefaultGeneratedFile({
      data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      mediaType: 'image/png',
    });

    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Here is a binary image',
        },
        { type: 'file', file: pngFile },
      ],
      tools: {},
    });

    expect(result).toStrictEqual([
      {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Here is a binary image',
            providerOptions: undefined,
          },
          {
            type: 'file',
            data: pngFile.base64,
            mediaType: pngFile.mediaType,
            providerOptions: undefined,
          },
        ],
      },
    ]);
  });

  it('should include images, reasoning, and tool calls in the correct order', () => {
    const pngFile = new DefaultGeneratedFile({
      data: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      mediaType: 'image/png',
    });

    const result = toResponseMessages({
      content: [
        {
          type: 'reasoning',
          text: 'Thinking text',
          providerMetadata: { testProvider: { signature: 'sig' } },
        },
        { type: 'file', file: pngFile },
        {
          type: 'text',
          text: 'Combined response',
        },
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          input: {},
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": {
                "testProvider": {
                  "signature": "sig",
                },
              },
              "text": "Thinking text",
              "type": "reasoning",
            },
            {
              "data": "iVBORw0KGgo=",
              "mediaType": "image/png",
              "providerOptions": undefined,
              "type": "file",
            },
            {
              "providerOptions": undefined,
              "text": "Combined response",
              "type": "text",
            },
            {
              "input": {},
              "providerExecuted": undefined,
              "providerOptions": undefined,
              "toolCallId": "123",
              "toolName": "testTool",
              "type": "tool-call",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });

  it('should not append text parts if text is empty string', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: '',
        },
        {
          type: 'tool-call',
          toolCallId: '123',
          toolName: 'testTool',
          input: {},
        },
      ],
      tools: {
        testTool: tool({
          description: 'A test tool',
          inputSchema: z.object({}),
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "input": {},
              "providerExecuted": undefined,
              "providerOptions": undefined,
              "toolCallId": "123",
              "toolName": "testTool",
              "type": "tool-call",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });

  it('should not append assistant message if there is no content', () => {
    const result = toResponseMessages({
      content: [],
      tools: {},
    });

    expect(result).toEqual([]);
  });

  describe('provider-executed tool calls', () => {
    it('should include provider-executed tool calls and results', () => {
      const result = toResponseMessages({
        content: [
          {
            type: 'text',
            text: 'Let me search for recent news from San Francisco.',
          },
          {
            type: 'tool-call',
            toolCallId: 'srvtoolu_011cNtbtzFARKPcAcp7w4nh9',
            toolName: 'web_search',
            input: {
              query: 'San Francisco major news events June 22 2025',
            },
            providerExecuted: true,
          },
          {
            type: 'tool-result',
            toolCallId: 'srvtoolu_011cNtbtzFARKPcAcp7w4nh9',
            toolName: 'web_search',
            input: {
              query: 'San Francisco major news events June 22 2025',
            },
            output: [
              { url: 'https://patch.com/california/san-francisco/calendar' },
            ],
            providerExecuted: true,
          },
          {
            type: 'text',
            text: 'Based on the search results, several significant events took place in San Francisco yesterday (June 22, 2025). Here are the main highlights:\n\n1. Juneteenth Celebration:\n',
          },
        ],
        tools: {
          web_search: tool({
            type: 'provider-defined',
            id: 'test.web_search',
            name: 'web_search',
            inputSchema: z.object({
              query: z.string(),
            }),
            outputSchema: z.array(
              z.object({
                url: z.string(),
              }),
            ),
            args: {},
          }),
        },
      });

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "providerOptions": undefined,
                "text": "Let me search for recent news from San Francisco.",
                "type": "text",
              },
              {
                "input": {
                  "query": "San Francisco major news events June 22 2025",
                },
                "providerExecuted": true,
                "providerOptions": undefined,
                "toolCallId": "srvtoolu_011cNtbtzFARKPcAcp7w4nh9",
                "toolName": "web_search",
                "type": "tool-call",
              },
              {
                "output": {
                  "type": "json",
                  "value": [
                    {
                      "url": "https://patch.com/california/san-francisco/calendar",
                    },
                  ],
                },
                "providerExecuted": true,
                "providerOptions": undefined,
                "toolCallId": "srvtoolu_011cNtbtzFARKPcAcp7w4nh9",
                "toolName": "web_search",
                "type": "tool-result",
              },
              {
                "providerOptions": undefined,
                "text": "Based on the search results, several significant events took place in San Francisco yesterday (June 22, 2025). Here are the main highlights:

        1. Juneteenth Celebration:
        ",
                "type": "text",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });

  it('should include provider metadata in the text parts', () => {
    const result = toResponseMessages({
      content: [
        {
          type: 'text',
          text: 'Here is a text',
          providerMetadata: { testProvider: { signature: 'sig' } },
        },
      ],
      tools: {},
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "providerOptions": {
                "testProvider": {
                  "signature": "sig",
                },
              },
              "text": "Here is a text",
              "type": "text",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });
});

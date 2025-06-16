import { z } from 'zod';
import { tool } from '../tool';
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
        testTool: {
          description: 'A test tool',
          inputSchema: z.object({}),
        },
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
          execute: async () => 'Tool result',
        }),
      },
    });

    expect(result).toEqual([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Tool used' },
          {
            type: 'tool-call',
            toolCallId: '123',
            toolName: 'testTool',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: '123',
            toolName: 'testTool',
            output: 'Tool result',
          },
        ],
      },
    ]);
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
          execute: async () => 'image-base64',
          experimental_toToolResultContent(result) {
            return [{ type: 'image', data: result, mediaType: 'image/png' }];
          },
        }),
      },
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "content": [
            {
              "text": "multipart tool result",
              "type": "text",
            },
            {
              "input": {},
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
              "experimental_content": [
                {
                  "data": "image-base64",
                  "mediaType": "image/png",
                  "type": "image",
                },
              ],
              "output": [
                {
                  "data": "image-base64",
                  "mediaType": "image/png",
                  "type": "image",
                },
              ],
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
          { type: 'text', text: 'Here is an image' },
          { type: 'file', data: pngFile.base64, mediaType: pngFile.mediaType },
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
          { type: 'text', text: 'Here are multiple images' },
          { type: 'file', data: pngFile.base64, mediaType: pngFile.mediaType },
          {
            type: 'file',
            data: jpegFile.base64,
            mediaType: jpegFile.mediaType,
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
          { type: 'text', text: 'Here is a binary image' },
          { type: 'file', data: pngFile.base64, mediaType: pngFile.mediaType },
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
              "type": "file",
            },
            {
              "text": "Combined response",
              "type": "text",
            },
            {
              "input": {},
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
});

import { z } from 'zod/v4';
import { InferUITool, UIMessage } from './ui-messages';
import {
  safeValidateUIMessages,
  validateUIMessages,
} from './validate-ui-messages';
import { describe, it, expect, expectTypeOf } from 'vitest';

describe('validateUIMessages', () => {
  describe('parameter validation', () => {
    it('should throw InvalidArgumentError when messages parameter is null', async () => {
      await expect(
        validateUIMessages({
          messages: null,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_InvalidArgumentError: Invalid argument for parameter messages: messages parameter must be provided]
      `);
    });

    it('should throw InvalidArgumentError when messages parameter is undefined', async () => {
      await expect(
        validateUIMessages({
          messages: undefined,
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_InvalidArgumentError: Invalid argument for parameter messages: messages parameter must be provided]
      `);
    });
  });

  describe('metadata', () => {
    it('should validate a user message with metadata when no metadata schema is provided', async () => {
      type TestMessage = UIMessage<{ foo: string }>;

      const messages = await validateUIMessages<TestMessage>({
        messages: [
          {
            id: '1',
            role: 'user',
            metadata: {
              foo: 'bar',
            },
            parts: [{ type: 'text', text: 'Hello, world!' }],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();

      expect(messages).toMatchInlineSnapshot(`
          [
            {
              "id": "1",
              "metadata": {
                "foo": "bar",
              },
              "parts": [
                {
                  "text": "Hello, world!",
                  "type": "text",
                },
              ],
              "role": "user",
            },
          ]
        `);
    });

    it('should validate a user message with metadata', async () => {
      type TestMessage = UIMessage<{ foo: string }>;

      const messages = await validateUIMessages<TestMessage>({
        messages: [
          {
            id: '1',
            role: 'user',
            metadata: {
              foo: 'bar',
            },
            parts: [{ type: 'text', text: 'Hello, world!' }],
          },
        ],
        metadataSchema: z.object({
          foo: z.string(),
        }),
      });

      expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "metadata": {
              "foo": "bar",
            },
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('should throw type validation error when metadata is invalid ', async () => {
      await expect(
        validateUIMessages<UIMessage<{ foo: string }>>({
          messages: [
            {
              id: '1',
              role: 'user',
              metadata: { foo: 123 },
              parts: [{ type: 'text', text: 'Hello, world!' }],
            },
          ],
          metadataSchema: z.object({
            foo: z.string(),
          }),
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: {"foo":123}.
        Error message: [{"expected":"string","code":"invalid_type","path":["foo"],"message":"Invalid input: expected string, received number"}]]
      `);
    });

    it('should validate text part with provider metadata', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [
              {
                type: 'text',
                text: 'Hello, world!',
                providerMetadata: {
                  someProvider: {
                    custom: 'metadata',
                  },
                },
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "providerMetadata": {
                  "someProvider": {
                    "custom": "metadata",
                  },
                },
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });
  });

  describe('text parts', () => {
    it('should validate a user message with a text part', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello, world!' }],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "text": "Hello, world!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });
  });

  describe('reasoning parts', () => {
    it('should validate an assistant message with a reasoning part', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [{ type: 'reasoning', text: 'Hello, world!' }],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "text": "Hello, world!",
                "type": "reasoning",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });

  describe('source url parts', () => {
    it('should validate an assistant message with a source url part', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'source-url',
                sourceId: '1',
                url: 'https://example.com',
                title: 'Example',
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "sourceId": "1",
                "title": "Example",
                "type": "source-url",
                "url": "https://example.com",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });

  describe('source document parts', () => {
    it('should validate an assistant message with a source document part', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'source-document',
                sourceId: '1',
                mediaType: 'text/plain',
                title: 'Example',
                filename: 'example.txt',
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "filename": "example.txt",
                "mediaType": "text/plain",
                "sourceId": "1",
                "title": "Example",
                "type": "source-document",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });

  describe('file parts', () => {
    it('should validate an assistant message with a file part', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'file',
                mediaType: 'text/plain',
                url: 'https://example.com',
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "mediaType": "text/plain",
                "type": "file",
                "url": "https://example.com",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });

  describe('step start parts', () => {
    it('should validate an assistant message with a step start part', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [{ type: 'step-start' }],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "type": "step-start",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });

  describe('data parts', () => {
    it('should validate an assistant message with two data parts', async () => {
      type TestMessage = UIMessage<
        never,
        {
          foo: { foo: string };
          bar: { bar: number };
        },
        never
      >;

      const messages = await validateUIMessages<TestMessage>({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              { type: 'data-foo', data: { foo: 'bar' } },
              { type: 'data-bar', data: { bar: 123 } },
            ],
          },
        ],
        dataSchemas: {
          foo: z.object({ foo: z.string() }),
          bar: z.object({ bar: z.number() }),
        },
      });

      expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "data": {
                  "foo": "bar",
                },
                "type": "data-foo",
              },
              {
                "data": {
                  "bar": 123,
                },
                "type": "data-bar",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should throw type validation error when data is invalid', async () => {
      await expect(
        validateUIMessages<UIMessage<never, { foo: { foo: string } }>>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [{ type: 'data-foo', data: { foo: 123 } }],
            },
          ],
          dataSchemas: {
            foo: z.object({ foo: z.string() }),
          },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: {"foo":123}.
        Error message: [{"expected":"string","code":"invalid_type","path":["foo"],"message":"Invalid input: expected string, received number"}]]
      `);
    });

    it('should throw type validation error when there is no data schema for a data part', async () => {
      await expect(
        validateUIMessages<UIMessage<never, { foo: { foo: string } }>>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [{ type: 'data-bar', data: { foo: 'bar' } }],
            },
          ],
          dataSchemas: {
            foo: z.object({ foo: z.string() }),
          },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: {"foo":"bar"}.
        Error message: No data schema found for data part bar]
      `);
    });
  });

  describe('dynamic tool parts', () => {
    it('should validate an assistant message with a dynamic tool part in input-streaming state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                toolName: 'foo',
                toolCallId: '1',
                state: 'input-streaming',
                input: { foo: 'bar' },
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "state": "input-streaming",
                "toolCallId": "1",
                "toolName": "foo",
                "type": "dynamic-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a dynamic tool part in input-available state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                toolName: 'foo',
                toolCallId: '1',
                state: 'input-available',
                input: { foo: 'bar' },
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "state": "input-available",
                "toolCallId": "1",
                "toolName": "foo",
                "type": "dynamic-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a dynamic tool part in output-available state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                toolName: 'foo',
                toolCallId: '1',
                state: 'output-available',
                input: { foo: 'bar' },
                output: { result: 'success' },
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "output": {
                  "result": "success",
                },
                "state": "output-available",
                "toolCallId": "1",
                "toolName": "foo",
                "type": "dynamic-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a dynamic tool part in output-error state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'dynamic-tool',
                toolName: 'foo',
                toolCallId: '1',
                state: 'output-error',
                input: { foo: 'bar' },
                errorText: 'Tool execution failed',
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "errorText": "Tool execution failed",
                "input": {
                  "foo": "bar",
                },
                "state": "output-error",
                "toolCallId": "1",
                "toolName": "foo",
                "type": "dynamic-tool",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });

  describe('tool parts', () => {
    const testTool = {
      name: 'foo',
      inputSchema: z.object({ foo: z.string() }),
      outputSchema: z.object({ result: z.string() }),
    };

    type TestMessage = UIMessage<
      never,
      never,
      { foo: InferUITool<typeof testTool> }
    >;

    it('should validate an assistant message with a tool part in input-streaming state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'input-streaming',
                input: { foo: 'bar' },
                providerExecuted: true,
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "input-streaming",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a tool part in input-available state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'input-available',
                input: { foo: 'bar' },
                providerExecuted: true,
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "input-available",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a tool part in output-available state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'output-available',
                input: { foo: 'bar' },
                output: { result: 'success' },
                providerExecuted: true,
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "output": {
                  "result": "success",
                },
                "providerExecuted": true,
                "state": "output-available",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a tool part in output-error state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'output-error',
                input: { foo: 'bar' },
                errorText: 'Tool execution failed',
                providerExecuted: true,
              },
            ],
          },
        ],
      });

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();

      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "errorText": "Tool execution failed",
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "output-error",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate tool input when state is input-available', async () => {
      const messages = await validateUIMessages<TestMessage>({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'input-available',
                input: { foo: 'bar' },
                providerExecuted: true,
              },
            ],
          },
        ],
        tools: {
          foo: testTool,
        },
      });

      expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "input-available",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate tool input and output when state is output-available', async () => {
      const messages = await validateUIMessages<TestMessage>({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'output-available',
                input: { foo: 'bar' },
                output: { result: 'success' },
              },
            ],
          },
        ],
        tools: {
          foo: testTool,
        },
      });

      expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": "bar",
                },
                "output": {
                  "result": "success",
                },
                "state": "output-available",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate tool input when state is output-error', async () => {
      const messages = await validateUIMessages<TestMessage>({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'output-error',
                input: { foo: 'bar' },
                errorText: 'Tool execution failed',
                providerExecuted: true,
              },
            ],
          },
        ],
        tools: {
          foo: testTool,
        },
      });

      expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "errorText": "Tool execution failed",
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "output-error",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should throw error when no tool schema is found', async () => {
      await expect(
        validateUIMessages<TestMessage>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-bar',
                  toolCallId: '1',
                  state: 'input-available',
                  input: { foo: 'bar' },
                  providerExecuted: true,
                },
              ],
            },
          ],
          tools: {
            foo: testTool,
          },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: {"foo":"bar"}.
        Error message: No tool schema found for tool part bar]
      `);
    });

    it('should throw error when tool input validation fails', async () => {
      await expect(
        validateUIMessages<TestMessage>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-foo',
                  toolCallId: '1',
                  state: 'input-available',
                  input: { foo: 123 }, // wrong type
                  providerExecuted: true,
                },
              ],
            },
          ],
          tools: {
            foo: testTool,
          },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: {"foo":123}.
        Error message: [{"expected":"string","code":"invalid_type","path":["foo"],"message":"Invalid input: expected string, received number"}]]
      `);
    });

    it('should throw error when tool output validation fails', async () => {
      await expect(
        validateUIMessages<TestMessage>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-foo',
                  toolCallId: '1',
                  state: 'output-available',
                  providerExecuted: true,
                  input: { foo: 'bar' },
                  output: { result: 123 }, // wrong type
                },
              ],
            },
          ],
          tools: {
            foo: testTool,
          },
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: {"result":123}.
        Error message: [{"expected":"string","code":"invalid_type","path":["result"],"message":"Invalid input: expected string, received number"}]]
      `);
    });

    it('should not validate input in input-streaming state', async () => {
      const messages = await validateUIMessages<TestMessage>({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'input-streaming',
                input: { foo: 123 }, // wrong type but should not be validated
                providerExecuted: true,
              },
            ],
          },
        ],
        tools: {
          foo: testTool,
        },
      });

      expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
      expect(messages).toMatchInlineSnapshot(`
        [
          {
            "id": "1",
            "parts": [
              {
                "input": {
                  "foo": 123,
                },
                "providerExecuted": true,
                "state": "input-streaming",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });
  });
});

export function expectToBe<T extends boolean>(
  value: boolean,
  expected: T,
): asserts value is T {
  expect(value).toBe(expected);
}

describe('safeValidateUIMessages', () => {
  it('should return success result for valid messages', async () => {
    const result = await safeValidateUIMessages({
      messages: [
        {
          id: '1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello, world!' }],
        },
      ],
    });

    expectToBe(result.success, true);
    expect(result.data).toMatchInlineSnapshot(`
      [
        {
          "id": "1",
          "parts": [
            {
              "text": "Hello, world!",
              "type": "text",
            },
          ],
          "role": "user",
        },
      ]
    `);
  });

  it('should return failure result when messages parameter is null', async () => {
    const result = await safeValidateUIMessages({
      messages: null,
    });

    expectToBe(result.success, false);
    expect(result.error.name).toBe('AI_InvalidArgumentError');
    expect(result.error.message).toBe(
      'Invalid argument for parameter messages: messages parameter must be provided',
    );
  });

  it('should return failure result when metadata validation fails', async () => {
    const result = await safeValidateUIMessages<UIMessage<{ foo: string }>>({
      messages: [
        {
          id: '1',
          role: 'user',
          metadata: { foo: 123 },
          parts: [{ type: 'text', text: 'Hello, world!' }],
        },
      ],
      metadataSchema: z.object({ foo: z.string() }),
    });

    expectToBe(result.success, false);
    expect(result.error.name).toBe('AI_TypeValidationError');
    expect(result.error.message).toContain('Type validation failed');
  });

  it('should return failure result when tool input validation fails', async () => {
    const testTool = {
      name: 'foo',
      inputSchema: z.object({ foo: z.string() }),
      outputSchema: z.object({ result: z.string() }),
    };

    const result = await safeValidateUIMessages({
      messages: [
        {
          id: '1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-foo',
              toolCallId: '1',
              state: 'input-available',
              input: { foo: 123 },
              providerExecuted: true,
            },
          ],
        },
      ],
      tools: { foo: testTool },
    });

    expectToBe(result.success, false);
    expect(result.error.name).toBe('AI_TypeValidationError');
    expect(result.error.message).toContain('Type validation failed');
  });

  it('should return failure result when data schema is missing', async () => {
    const result = await safeValidateUIMessages({
      messages: [
        {
          id: '1',
          role: 'assistant',
          parts: [{ type: 'data-bar', data: { foo: 'bar' } }],
        },
      ],
      dataSchemas: {
        foo: z.object({ foo: z.string() }),
      },
    });

    expectToBe(result.success, false);
    expect(result.error.name).toBe('AI_TypeValidationError');
    expect(result.error.message).toContain(
      'No data schema found for data part bar',
    );
  });

  it('should return failure result for invalid message structure', async () => {
    const result = await safeValidateUIMessages({
      messages: [
        {
          role: 'user',
        },
      ],
    });

    expectToBe(result.success, false);
    expect(result.error.name).toBe('AI_TypeValidationError');
  });
});

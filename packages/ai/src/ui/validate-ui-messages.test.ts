import { z } from 'zod/v4';
import { UIMessage } from './ui-messages';
import { validateUIMessages } from './validate-ui-messages';

describe('validateUIMessages', () => {
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
});

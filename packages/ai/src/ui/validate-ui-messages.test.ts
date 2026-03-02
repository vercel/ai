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

    it('should throw TypeValidationError when messages array is empty', async () => {
      await expect(
        validateUIMessages({
          messages: [],
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: [].
        Error message: [
          {
            "origin": "array",
            "code": "too_small",
            "minimum": 1,
            "inclusive": true,
            "path": [],
            "message": "Messages array must not be empty"
          }
        ]]
      `);
    });

    it('should throw TypeValidationError when message has empty parts array', async () => {
      await expect(
        validateUIMessages({
          messages: [
            {
              id: '1',
              role: 'user',
              parts: [],
            },
          ],
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: [{"id":"1","role":"user","parts":[]}].
        Error message: [
          {
            "origin": "array",
            "code": "too_small",
            "minimum": 1,
            "inclusive": true,
            "path": [
              0,
              "parts"
            ],
            "message": "Message must contain at least one part"
          }
        ]]
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
        [AI_TypeValidationError: Type validation failed for messages[0].metadata (id: "1"): Value: {"foo":123}.
        Error message: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "foo"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
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
        [AI_TypeValidationError: Type validation failed for messages[0].parts[0].data (foo): Value: {"foo":123}.
        Error message: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "foo"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
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
        [AI_TypeValidationError: Type validation failed for messages[0].parts[0].data (bar): Value: {"foo":"bar"}.
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

    it('should validate an assistant message with a dynamic tool part in approval-requested state', async () => {
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
                state: 'approval-requested',
                input: { foo: 'bar' },
                approval: { id: 'approval-1' },
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
                "approval": {
                  "id": "approval-1",
                },
                "input": {
                  "foo": "bar",
                },
                "state": "approval-requested",
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

    it('should validate an assistant message with a dynamic tool part in approval-responded state', async () => {
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
                state: 'approval-responded',
                input: { foo: 'bar' },
                approval: {
                  id: 'approval-1',
                  approved: true,
                  reason: 'User confirmed',
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
                "approval": {
                  "approved": true,
                  "id": "approval-1",
                  "reason": "User confirmed",
                },
                "input": {
                  "foo": "bar",
                },
                "state": "approval-responded",
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

    it('should validate an assistant message with a dynamic tool part in output-denied state', async () => {
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
                state: 'output-denied',
                input: { foo: 'bar' },
                approval: {
                  id: 'approval-1',
                  approved: false,
                  reason: 'User denied',
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
                "approval": {
                  "approved": false,
                  "id": "approval-1",
                  "reason": "User denied",
                },
                "input": {
                  "foo": "bar",
                },
                "state": "output-denied",
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

    // ========================================
    // Dynamic Tool Negative + Structural Tests
    // ========================================

    it('should reject dynamic tool part in approval-requested state without approval field', async () => {
      await expect(
        validateUIMessages({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'dynamic-tool',
                  toolName: 'foo',
                  toolCallId: '1',
                  state: 'approval-requested',
                  input: { foo: 'bar' },
                },
              ],
            },
          ],
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: [{"id":"1","role":"assistant","parts":[{"type":"dynamic-tool","toolName":"foo","toolCallId":"1","state":"approval-requested","input":{"foo":"bar"}}]}].
        Error message: [
          {
            "code": "invalid_union",
            "errors": [
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "text"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"text\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "text"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "streaming",
                    "done"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid option: expected one of \\"streaming\\"|\\"done\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "reasoning"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"reasoning\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "text"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "streaming",
                    "done"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid option: expected one of \\"streaming\\"|\\"done\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "source-url"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"source-url\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "sourceId"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "url"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "source-document"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"source-document\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "sourceId"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "mediaType"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "title"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "file"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"file\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "mediaType"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "url"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "step-start"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"step-start\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "data-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"data-\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "input-streaming"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-streaming\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "input-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-available\\""
                }
              ],
              [
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "approval-responded"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"approval-responded\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "output-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-available\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "output-error"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-error\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "errorText"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "output-denied"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-denied\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "input-streaming"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-streaming\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "input-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-available\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "approval-responded"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"approval-responded\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "output-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-available\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "output-error"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-error\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "errorText"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "output-denied"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-denied\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ]
            ],
            "path": [
              0,
              "parts",
              0
            ],
            "message": "Invalid input"
          }
        ]]
      `);
    });

    it('should reject dynamic tool part in output-available state without output field', async () => {
      await expect(
        validateUIMessages({
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
                },
              ],
            },
          ],
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed for messages[0].parts[0].output (foo, id: "1"): Value: {"type":"dynamic-tool","toolName":"foo","toolCallId":"1","state":"output-available","input":{"foo":"bar"}}.
        Error message: output is required for dynamic-tool part in output-available state]
      `);
    });

    it('should reject dynamic tool part with an invalid state value', async () => {
      await expect(
        validateUIMessages({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'dynamic-tool',
                  toolName: 'foo',
                  toolCallId: '1',
                  state: 'invalid-state',
                  input: { foo: 'bar' },
                },
              ],
            },
          ],
        }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(`
        [AI_TypeValidationError: Type validation failed: Value: [{"id":"1","role":"assistant","parts":[{"type":"dynamic-tool","toolName":"foo","toolCallId":"1","state":"invalid-state","input":{"foo":"bar"}}]}].
        Error message: [
          {
            "code": "invalid_union",
            "errors": [
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "text"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"text\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "text"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "streaming",
                    "done"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid option: expected one of \\"streaming\\"|\\"done\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "reasoning"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"reasoning\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "text"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "streaming",
                    "done"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid option: expected one of \\"streaming\\"|\\"done\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "source-url"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"source-url\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "sourceId"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "url"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "source-document"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"source-document\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "sourceId"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "mediaType"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "title"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "file"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"file\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "mediaType"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "url"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "step-start"
                  ],
                  "path": [
                    "type"
                  ],
                  "message": "Invalid input: expected \\"step-start\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "data-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"data-\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "input-streaming"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-streaming\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "input-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-available\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "approval-requested"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"approval-requested\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "approval-responded"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"approval-responded\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "output-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-available\\""
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "output-error"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-error\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "errorText"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "code": "invalid_value",
                  "values": [
                    "output-denied"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-denied\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "input-streaming"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-streaming\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "input-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"input-available\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "approval-requested"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"approval-requested\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "approval-responded"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"approval-responded\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "output-available"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-available\\""
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "output-error"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-error\\""
                },
                {
                  "expected": "string",
                  "code": "invalid_type",
                  "path": [
                    "errorText"
                  ],
                  "message": "Invalid input: expected string, received undefined"
                }
              ],
              [
                {
                  "origin": "string",
                  "code": "invalid_format",
                  "format": "starts_with",
                  "prefix": "tool-",
                  "path": [
                    "type"
                  ],
                  "message": "Invalid string: must start with \\"tool-\\""
                },
                {
                  "code": "invalid_value",
                  "values": [
                    "output-denied"
                  ],
                  "path": [
                    "state"
                  ],
                  "message": "Invalid input: expected \\"output-denied\\""
                },
                {
                  "expected": "object",
                  "code": "invalid_type",
                  "path": [
                    "approval"
                  ],
                  "message": "Invalid input: expected object, received undefined"
                }
              ]
            ],
            "path": [
              0,
              "parts",
              0
            ],
            "message": "Invalid input"
          }
        ]]
      `);
    });

    // ========================================
    // Dynamic Tool with `tools` Parameter
    // Documents current behavior: dynamic-tool parts are NOT schema-validated
    // even when tools param is provided, because type 'dynamic-tool' does not
    // match the part.type.startsWith('tool-') conditional.
    // See: // TODO support dynamic tools in validate-ui-messages.ts
    // ========================================

    describe('with tools parameter', () => {
      const testTool = {
        name: 'foo',
        inputSchema: z.object({ foo: z.string() }),
        outputSchema: z.object({ result: z.string() }),
      };

      it('should not validate dynamic tool input when tools param is provided', async () => {
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
          tools: { foo: testTool },
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

      it('should not validate dynamic tool input with matching toolName and invalid input', async () => {
        // Despite tools param having a schema for 'foo', dynamic-tool parts
        // bypass the tools validation conditional (type.startsWith('tool-')).
        // This documents the TODO gap — invalid input passes without error.
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
                  input: { wrong: 'type' },
                },
              ],
            },
          ],
          tools: { foo: testTool },
        });

        expectTypeOf(messages).toEqualTypeOf<Array<UIMessage>>();
        expect(messages).toMatchInlineSnapshot(`
          [
            {
              "id": "1",
              "parts": [
                {
                  "input": {
                    "wrong": "type",
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

      it('should not validate dynamic tool output when tools param is provided', async () => {
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
          tools: { foo: testTool },
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

      it('should validate static tool and not validate dynamic tool in mixed message', async () => {
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
                {
                  type: 'dynamic-tool',
                  toolName: 'some-dynamic-tool',
                  toolCallId: '2',
                  state: 'input-available',
                  input: { anything: 'goes' },
                },
              ],
            },
          ],
          tools: { foo: testTool },
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
                {
                  "input": {
                    "anything": "goes",
                  },
                  "state": "input-available",
                  "toolCallId": "2",
                  "toolName": "some-dynamic-tool",
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

    it('should validate an assistant message with a tool part in approval-requested state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'approval-requested',
                input: { foo: 'bar' },
                providerExecuted: true,
                approval: { id: 'approval-1' },
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
                "approval": {
                  "id": "approval-1",
                },
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "approval-requested",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a tool part in approval-responded state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'approval-responded',
                input: { foo: 'bar' },
                providerExecuted: true,
                approval: {
                  id: 'approval-1',
                  approved: true,
                  reason: 'User confirmed',
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
                "approval": {
                  "approved": true,
                  "id": "approval-1",
                  "reason": "User confirmed",
                },
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "approval-responded",
                "toolCallId": "1",
                "type": "tool-foo",
              },
            ],
            "role": "assistant",
          },
        ]
      `);
    });

    it('should validate an assistant message with a tool part in output-denied state', async () => {
      const messages = await validateUIMessages({
        messages: [
          {
            id: '1',
            role: 'assistant',
            parts: [
              {
                type: 'tool-foo',
                toolCallId: '1',
                state: 'output-denied',
                input: { foo: 'bar' },
                providerExecuted: true,
                approval: {
                  id: 'approval-1',
                  approved: false,
                  reason: 'User denied',
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
                "approval": {
                  "approved": false,
                  "id": "approval-1",
                  "reason": "User denied",
                },
                "input": {
                  "foo": "bar",
                },
                "providerExecuted": true,
                "state": "output-denied",
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

    it('should validate tool input when state is output-error and there is input', async () => {
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

    it('should skip tool input validation when state is output-error and there is no input', async () => {
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
                input: undefined,
                errorText: 'Tool input validation failed',
                providerExecuted: false,
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
                "errorText": "Tool input validation failed",
                "input": undefined,
                "providerExecuted": false,
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

    it('should preserve rawInput when state is output-error', async () => {
      const inputMessages = [
        {
          id: '1',
          role: 'assistant' as const,
          parts: [
            {
              type: 'tool-foo' as const,
              toolCallId: '1',
              state: 'output-error' as const,
              input: undefined,
              rawInput: { foo: 'bar' },
              errorText: 'Tool input validation failed',
              providerExecuted: false,
            },
          ],
        },
      ];

      const result = await validateUIMessages<TestMessage>({
        messages: inputMessages,
        tools: {
          foo: testTool,
        },
      });

      expect(result).toEqual(inputMessages);
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
        [AI_TypeValidationError: Type validation failed for messages[0].parts[0].input (bar, id: "1"): Value: {"foo":"bar"}.
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
        [AI_TypeValidationError: Type validation failed for messages[0].parts[0].input (foo, id: "1"): Value: {"foo":123}.
        Error message: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "foo"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
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
        [AI_TypeValidationError: Type validation failed for messages[0].parts[0].output (foo, id: "1"): Value: {"result":123}.
        Error message: [
          {
            "expected": "string",
            "code": "invalid_type",
            "path": [
              "result"
            ],
            "message": "Invalid input: expected string, received number"
          }
        ]]
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

    describe('with tools parameter - approval states', () => {
      it('should not validate tool input when state is approval-requested', async () => {
        const messages = await validateUIMessages<TestMessage>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-foo',
                  toolCallId: '1',
                  state: 'approval-requested',
                  input: { foo: 'bar' },
                  providerExecuted: true,
                  approval: { id: 'approval-1' },
                },
              ],
            },
          ],
          tools: { foo: testTool },
        });

        expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
        expect(messages).toMatchInlineSnapshot(`
          [
            {
              "id": "1",
              "parts": [
                {
                  "approval": {
                    "id": "approval-1",
                  },
                  "input": {
                    "foo": "bar",
                  },
                  "providerExecuted": true,
                  "state": "approval-requested",
                  "toolCallId": "1",
                  "type": "tool-foo",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should not validate tool input when state is approval-responded', async () => {
        const messages = await validateUIMessages<TestMessage>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-foo',
                  toolCallId: '1',
                  state: 'approval-responded',
                  input: { foo: 'bar' },
                  providerExecuted: true,
                  approval: {
                    id: 'approval-1',
                    approved: true,
                    reason: 'User confirmed',
                  },
                },
              ],
            },
          ],
          tools: { foo: testTool },
        });

        expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
        expect(messages).toMatchInlineSnapshot(`
          [
            {
              "id": "1",
              "parts": [
                {
                  "approval": {
                    "approved": true,
                    "id": "approval-1",
                    "reason": "User confirmed",
                  },
                  "input": {
                    "foo": "bar",
                  },
                  "providerExecuted": true,
                  "state": "approval-responded",
                  "toolCallId": "1",
                  "type": "tool-foo",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should not validate tool input when state is output-denied', async () => {
        const messages = await validateUIMessages<TestMessage>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-foo',
                  toolCallId: '1',
                  state: 'output-denied',
                  input: { foo: 'bar' },
                  providerExecuted: true,
                  approval: {
                    id: 'approval-1',
                    approved: false,
                    reason: 'User denied',
                  },
                },
              ],
            },
          ],
          tools: { foo: testTool },
        });

        expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
        expect(messages).toMatchInlineSnapshot(`
          [
            {
              "id": "1",
              "parts": [
                {
                  "approval": {
                    "approved": false,
                    "id": "approval-1",
                    "reason": "User denied",
                  },
                  "input": {
                    "foo": "bar",
                  },
                  "providerExecuted": true,
                  "state": "output-denied",
                  "toolCallId": "1",
                  "type": "tool-foo",
                },
              ],
              "role": "assistant",
            },
          ]
        `);
      });

      it('should not validate tool input when state is approval-requested even with invalid input', async () => {
        // Proves input validation is skipped for approval states —
        // { foo: 123 } violates z.object({ foo: z.string() }) but passes.
        const messages = await validateUIMessages<TestMessage>({
          messages: [
            {
              id: '1',
              role: 'assistant',
              parts: [
                {
                  type: 'tool-foo',
                  toolCallId: '1',
                  state: 'approval-requested',
                  input: { foo: 123 },
                  providerExecuted: true,
                  approval: { id: 'approval-1' },
                },
              ],
            },
          ],
          tools: { foo: testTool },
        });

        expectTypeOf(messages).toEqualTypeOf<Array<TestMessage>>();
        expect(messages).toMatchInlineSnapshot(`
          [
            {
              "id": "1",
              "parts": [
                {
                  "approval": {
                    "id": "approval-1",
                  },
                  "input": {
                    "foo": 123,
                  },
                  "providerExecuted": true,
                  "state": "approval-requested",
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

  it('should return failure result when messages array is empty', async () => {
    const result = await safeValidateUIMessages({
      messages: [],
    });

    expectToBe(result.success, false);
    expect(result.error.name).toBe('AI_TypeValidationError');
    expect(result.error.message).toContain('Type validation failed');
    expect(result.error.message).toContain('Messages array must not be empty');
  });

  it('should return failure result when message has empty parts array', async () => {
    const result = await safeValidateUIMessages({
      messages: [
        {
          id: '1',
          role: 'user',
          parts: [],
        },
      ],
    });

    expectToBe(result.success, false);
    expect(result.error.name).toBe('AI_TypeValidationError');
    expect(result.error.message).toContain('Type validation failed');
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

  it('should return success result for dynamic tool with tools param', async () => {
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
              type: 'dynamic-tool',
              toolName: 'foo',
              toolCallId: '1',
              state: 'input-available',
              input: { foo: 'bar' },
            },
          ],
        },
      ],
      tools: { foo: testTool },
    });

    expectToBe(result.success, true);
    expect(result.data).toMatchInlineSnapshot(`
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

  it('should return success result for mixed static and dynamic tools with tools param', async () => {
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
              input: { foo: 'bar' },
              providerExecuted: true,
            },
            {
              type: 'dynamic-tool',
              toolName: 'some-dynamic-tool',
              toolCallId: '2',
              state: 'input-available',
              input: { anything: 'goes' },
            },
          ],
        },
      ],
      tools: { foo: testTool },
    });

    expectToBe(result.success, true);
    expect(result.data).toMatchInlineSnapshot(`
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
            {
              "input": {
                "anything": "goes",
              },
              "state": "input-available",
              "toolCallId": "2",
              "toolName": "some-dynamic-tool",
              "type": "dynamic-tool",
            },
          ],
          "role": "assistant",
        },
      ]
    `);
  });
});

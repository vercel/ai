import { z } from 'zod/v4';
import { UIMessage } from './ui-messages';
import { validateUIMessages } from './validate-ui-messages';

describe('validateUIMessages', () => {
  describe('metadata', () => {
    it('should validate a user message with metadata', async () => {
      const messages = await validateUIMessages<UIMessage<{ foo: string }>>({
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

      expectTypeOf(messages).toEqualTypeOf<Array<UIMessage<{ foo: string }>>>();

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
});

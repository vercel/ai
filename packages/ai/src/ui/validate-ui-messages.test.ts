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
});

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
});

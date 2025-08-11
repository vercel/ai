import { mockId } from '@ai-sdk/provider-utils/test';
import { convertToUIMessages } from './convert-to-ui-messages';

describe('convertToUIMessages', () => {
  describe('user message', () => {
    it('should convert a user message with a string content', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'user',
            content: 'Hello, AI!',
          },
        ],
        { generateId: mockId() },
      );

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "parts": [
              {
                "text": "Hello, AI!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('should convert a user message with text content parts', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'user',
            content: [{ text: 'Hello, AI!', type: 'text' }],
          },
        ],
        { generateId: mockId() },
      );

      expect(result).toMatchInlineSnapshot(`
        [
          {
            "id": "id-0",
            "parts": [
              {
                "text": "Hello, AI!",
                "type": "text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('should convert a user message with a file content part', () => {
      const result = convertToUIMessages(
        [
          {
            role: 'user',
            content: [{ type: 'file', data: 'data', mediaType: 'image/png' }],
          },
        ],
        { generateId: mockId() },
      );

      expect(result).toMatchInlineSnapshot(`[]`);
    });
  });

  describe('assistant message', () => {});
});

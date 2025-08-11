import { mockId } from '@ai-sdk/provider-utils/test';
import { convertToUIMessages } from './convert-to-ui-messages';

describe('convertToUIMessages', () => {
  describe('user message', () => {
    it('should convert a simple user message', () => {
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
  });

  describe('assistant message', () => {});

  describe('multiple messages', () => {});
});

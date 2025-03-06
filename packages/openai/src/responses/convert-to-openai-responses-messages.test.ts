import { convertToOpenAIResponsesMessages } from './convert-to-openai-responses-messages';

describe('convertToOpenAIResponsesMessages', () => {
  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      });

      expect(result).toEqual([
        { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
      ]);
    });

    it('should convert messages with image parts using URL', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'image',
                image: new URL('https://example.com/image.jpg'),
              },
            ],
          },
        ],
      });

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Hello' },
            {
              type: 'input_image',
              image_url: 'https://example.com/image.jpg',
            },
          ],
        },
      ]);
    });

    it('should convert messages with image parts using binary data', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: new Uint8Array([0, 1, 2, 3]),
                mimeType: 'image/png',
              },
            ],
          },
        ],
      });

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,AAECAw==',
            },
          ],
        },
      ]);
    });

    it('should use default mime type for binary images', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ],
      });

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'data:image/jpeg;base64,AAECAw==',
            },
          ],
        },
      ]);
    });
  });

  describe('assistant messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      ]);
    });
  });
});

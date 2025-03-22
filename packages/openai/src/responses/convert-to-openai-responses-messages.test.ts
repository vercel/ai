import { convertToOpenAIResponsesMessages } from './convert-to-openai-responses-messages';

describe('convertToOpenAIResponsesMessages', () => {
  describe('system messages', () => {
    it('should convert system messages to system role', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([{ role: 'system', content: 'Hello' }]);
    });

    it('should convert system messages to developer role', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'developer',
      });

      expect(result.messages).toEqual([
        { role: 'developer', content: 'Hello' },
      ]);
    });

    it('should remove system messages', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'remove',
      });

      expect(result.messages).toEqual([]);
    });
  });

  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
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
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
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
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
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
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
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

    it('should add image detail when specified through extension', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: new Uint8Array([0, 1, 2, 3]),
                mimeType: 'image/png',
                providerMetadata: {
                  openai: {
                    imageDetail: 'low',
                  },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,AAECAw==',
              detail: 'low',
            },
          ],
        },
      ]);
    });

    it('should convert messages with PDF file parts', async () => {
      const base64Data = 'AQIDBAU='; // Base64 encoding of pdfData

      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mimeType: 'application/pdf',
                data: base64Data,
                filename: 'document.pdf',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'document.pdf',
              file_data: 'data:application/pdf;base64,AQIDBAU=',
            },
          ],
        },
      ]);
    });

    it('should use default filename for PDF file parts when not provided', async () => {
      const base64Data = 'AQIDBAU=';

      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mimeType: 'application/pdf',
                data: base64Data,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              filename: 'part-0.pdf',
              file_data: 'data:application/pdf;base64,AQIDBAU=',
            },
          ],
        },
      ]);
    });

    it('should throw error for unsupported file types', async () => {
      const base64Data = 'AQIDBAU=';

      expect(() => {
        convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mimeType: 'text/plain',
                  data: base64Data,
                },
              ],
            },
          ],
          systemMessageMode: 'system',
        });
      }).toThrow('Only PDF files are supported in user messages');
    });

    it('should throw error for file URLs', async () => {
      expect(() => {
        convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mimeType: 'application/pdf',
                  data: new URL('https://example.com/document.pdf'),
                },
              ],
            },
          ],
          systemMessageMode: 'system',
        });
      }).toThrow('File URLs in user messages');
    });
  });

  describe('assistant messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      ]);
    });

    it('should convert messages with tool call parts', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I will search for that information.' },
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'search',
                args: { query: 'weather in San Francisco' },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'I will search for that information.',
            },
          ],
        },
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'search',
          arguments: JSON.stringify({ query: 'weather in San Francisco' }),
        },
      ]);
    });

    it('should convert multiple tool call parts in a single message', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'search',
                args: { query: 'weather in San Francisco' },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_456',
                toolName: 'calculator',
                args: { expression: '2 + 2' },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'search',
          arguments: JSON.stringify({ query: 'weather in San Francisco' }),
        },
        {
          type: 'function_call',
          call_id: 'call_456',
          name: 'calculator',
          arguments: JSON.stringify({ expression: '2 + 2' }),
        },
      ]);
    });
  });

  describe('tool messages', () => {
    it('should convert tool result parts', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                result: { temperature: '72°F', condition: 'Sunny' },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: JSON.stringify({ temperature: '72°F', condition: 'Sunny' }),
        },
      ]);
    });

    it('should convert multiple tool result parts in a single message', async () => {
      const result = convertToOpenAIResponsesMessages({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                result: { temperature: '72°F', condition: 'Sunny' },
              },
              {
                type: 'tool-result',
                toolCallId: 'call_456',
                toolName: 'calculator',
                result: 4,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: JSON.stringify({ temperature: '72°F', condition: 'Sunny' }),
        },
        {
          type: 'function_call_output',
          call_id: 'call_456',
          output: JSON.stringify(4),
        },
      ]);
    });
  });
});

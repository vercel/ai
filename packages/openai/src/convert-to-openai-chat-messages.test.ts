import { convertToOpenAIChatMessages } from './convert-to-openai-chat-messages';

describe('system messages', () => {
  it('should forward system messages', async () => {
    const result = convertToOpenAIChatMessages({
      prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
    });

    expect(result.messages).toEqual([
      { role: 'system', content: 'You are a helpful assistant.' },
    ]);
  });

  it('should convert system messages to developer messages when requested', async () => {
    const result = convertToOpenAIChatMessages({
      prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
      systemMessageMode: 'developer',
    });

    expect(result.messages).toEqual([
      { role: 'developer', content: 'You are a helpful assistant.' },
    ]);
  });

  it('should remove system messages when requested', async () => {
    const result = convertToOpenAIChatMessages({
      prompt: [{ role: 'system', content: 'You are a helpful assistant.' }],
      systemMessageMode: 'remove',
    });

    expect(result.messages).toEqual([]);
  });
});

describe('user messages', () => {
  it('should convert messages with only a text part to a string content', async () => {
    const result = convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    });

    expect(result.messages).toEqual([{ role: 'user', content: 'Hello' }]);
  });

  it('should convert messages with image parts', async () => {
    const result = convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            {
              type: 'image',
              image: new Uint8Array([0, 1, 2, 3]),
              mimeType: 'image/png',
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Hello' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAECAw==' },
          },
        ],
      },
    ]);
  });

  it('should add image detail when specified through extension', async () => {
    const result = convertToOpenAIChatMessages({
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
    });

    expect(result.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: 'data:image/png;base64,AAECAw==',
              detail: 'low',
            },
          },
        ],
      },
    ]);
  });

  describe('file parts', () => {
    it('should throw for unsupported mime types', () => {
      expect(() =>
        convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                { type: 'file', data: 'AAECAw==', mimeType: 'image/png' },
              ],
            },
          ],
        }),
      ).toThrow(
        "'File content part type image/png in user messages' functionality not supported.",
      );
    });

    it('should throw for URL data', () => {
      expect(() =>
        convertToOpenAIChatMessages({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  data: new URL('https://example.com/foo.wav'),
                  mimeType: 'audio/wav',
                },
              ],
            },
          ],
        }),
      ).toThrow(
        "'File content parts with URL data' functionality not supported.",
      );
    });

    it('should add audio content for audio/wav file parts', () => {
      const result = convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'AAECAw==',
                mimeType: 'audio/wav',
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: 'AAECAw==', format: 'wav' },
            },
          ],
        },
      ]);
    });

    it('should add audio content for audio/mpeg file parts', () => {
      const result = convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'AAECAw==',
                mimeType: 'audio/mpeg',
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: 'AAECAw==', format: 'mp3' },
            },
          ],
        },
      ]);
    });

    it('should add audio content for audio/mp3 file parts', () => {
      const result = convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                data: 'AAECAw==',
                mimeType: 'audio/mp3', // not official but sometimes used
              },
            ],
          },
        ],
      });

      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_audio',
              input_audio: { data: 'AAECAw==', format: 'mp3' },
            },
          ],
        },
      ]);
    });

    it('should convert messages with PDF file parts', async () => {
      const base64Data = 'AQIDBAU='; // Base64 encoding of pdfData

      const result = convertToOpenAIChatMessages({
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
              type: 'file',
              file: {
                filename: 'document.pdf',
                file_data: 'data:application/pdf;base64,AQIDBAU=',
              },
            },
          ],
        },
      ]);
    });

    it('should use default filename for PDF file parts when not provided', async () => {
      const base64Data = 'AQIDBAU=';

      const result = convertToOpenAIChatMessages({
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
              type: 'file',
              file: {
                filename: 'part-0.pdf',
                file_data: 'data:application/pdf;base64,AQIDBAU=',
              },
            },
          ],
        },
      ]);
    });

    it('should throw error for unsupported file types', async () => {
      const base64Data = 'AQIDBAU=';

      expect(() => {
        convertToOpenAIChatMessages({
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
      }).toThrow(
        "'File content part type text/plain in user messages' functionality not supported.",
      );
    });

    it('should throw error for file URLs', async () => {
      expect(() => {
        convertToOpenAIChatMessages({
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
      }).toThrow(
        "'File content parts with URL data' functionality not supported.",
      );
    });
  });
});

describe('tool calls', () => {
  it('should stringify arguments to tool calls', () => {
    const result = convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              args: { foo: 'bar123' },
              toolCallId: 'quux',
              toolName: 'thwomp',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'quux',
              toolName: 'thwomp',
              result: { oof: '321rab' },
            },
          ],
        },
      ],
    });

    expect(result.messages).toEqual([
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            type: 'function',
            id: 'quux',
            function: {
              name: 'thwomp',
              arguments: JSON.stringify({ foo: 'bar123' }),
            },
          },
        ],
      },
      {
        role: 'tool',
        content: JSON.stringify({ oof: '321rab' }),
        tool_call_id: 'quux',
      },
    ]);
  });

  it('should convert tool calls to function calls with useLegacyFunctionCalling', () => {
    const result = convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              args: { foo: 'bar123' },
              toolCallId: 'quux',
              toolName: 'thwomp',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'quux',
              toolName: 'thwomp',
              result: { oof: '321rab' },
            },
          ],
        },
      ],
      useLegacyFunctionCalling: true,
    });

    expect(result.messages).toEqual([
      {
        role: 'assistant',
        content: '',
        function_call: {
          name: 'thwomp',
          arguments: JSON.stringify({ foo: 'bar123' }),
        },
      },
      {
        role: 'function',
        content: JSON.stringify({ oof: '321rab' }),
        name: 'thwomp',
      },
    ]);
  });
});

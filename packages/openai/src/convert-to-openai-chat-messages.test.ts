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
              type: 'file',
              mediaType: 'image/png',
              data: Buffer.from([0, 1, 2, 3]).toString('base64'),
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
              type: 'file',
              mediaType: 'image/png',
              data: Buffer.from([0, 1, 2, 3]).toString('base64'),
              providerOptions: {
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
                {
                  type: 'file',
                  data: 'AAECAw==',
                  mediaType: 'application/something',
                },
              ],
            },
          ],
        }),
      ).toThrow('file part media type application/something');
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
                  mediaType: 'audio/wav',
                },
              ],
            },
          ],
        }),
      ).toThrow('audio file parts with URLs');
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
                mediaType: 'audio/wav',
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
                mediaType: 'audio/mpeg',
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
                mediaType: 'audio/mp3', // not official but sometimes used
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
                mediaType: 'application/pdf',
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

    it('should convert messages with binary PDF file parts', async () => {
      const data = Uint8Array.from([1, 2, 3, 4, 5]);

      const result = convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data,
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

    it('should convert messages with PDF file parts using file_id', async () => {
      const result = convertToOpenAIChatMessages({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: 'file-pdf-12345',
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
              type: 'file',
              file: {
                file_id: 'file-pdf-12345',
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
                mediaType: 'application/pdf',
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
                  mediaType: 'text/plain',
                  data: base64Data,
                },
              ],
            },
          ],
          systemMessageMode: 'system',
        });
      }).toThrow('file part media type text/plain');
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
                  mediaType: 'application/pdf',
                  data: new URL('https://example.com/document.pdf'),
                },
              ],
            },
          ],
          systemMessageMode: 'system',
        });
      }).toThrow('PDF file parts with URLs');
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
              input: { foo: 'bar123' },
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
              output: { type: 'json', value: { oof: '321rab' } },
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

  it('should handle different tool output types', () => {
    const result = convertToOpenAIChatMessages({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: 'text-tool',
              toolName: 'text-tool',
              output: { type: 'text', value: 'Hello world' },
            },
            {
              type: 'tool-result',
              toolCallId: 'error-tool',
              toolName: 'error-tool',
              output: { type: 'error-text', value: 'Something went wrong' },
            },
          ],
        },
      ],
    });

    expect(result.messages).toMatchInlineSnapshot(`
      [
        {
          "content": "Hello world",
          "role": "tool",
          "tool_call_id": "text-tool",
        },
        {
          "content": "Something went wrong",
          "role": "tool",
          "tool_call_id": "error-tool",
        },
      ]
    `);
  });
});

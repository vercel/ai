import { convertToOpenAIResponsesInput } from './convert-to-openai-responses-input';
import { describe, it, expect } from 'vitest';

describe('convertToOpenAIResponsesInput', () => {
  describe('system messages', () => {
    it('should convert system messages to system role', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([{ role: 'system', content: 'Hello' }]);
    });

    it('should convert system messages to developer role', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'developer',
        store: true,
      });

      expect(result.input).toEqual([{ role: 'developer', content: 'Hello' }]);
    });

    it('should add a prompt cache breakpoint to a system message', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'system',
            content: 'Hello',
            providerOptions: {
              openai: { promptCacheBreakpoint: { mode: 'explicit' } },
            },
          },
        ],
        systemMessageMode: 'developer',
        store: true,
      });

      expect(result.input).toEqual([
        {
          role: 'developer',
          content: [
            {
              type: 'input_text',
              text: 'Hello',
              prompt_cache_breakpoint: { mode: 'explicit' },
            },
          ],
        },
      ]);
    });

    it('should remove system messages', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'remove',
        store: true,
      });

      expect(result.input).toEqual([]);
    });
  });

  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
        { role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
      ]);
    });

    it('should add prompt cache breakpoints to supported content blocks', async () => {
      const promptCacheBreakpoint = { mode: 'explicit' } as const;
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Hello',
                providerOptions: { openai: { promptCacheBreakpoint } },
              },
              {
                type: 'file',
                mediaType: 'image/png',
                data: new URL('https://example.com/image.png'),
                providerOptions: { openai: { promptCacheBreakpoint } },
              },
              {
                type: 'file',
                mediaType: 'application/pdf',
                data: 'file-pdf-123',
                providerOptions: { openai: { promptCacheBreakpoint } },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        fileIdPrefixes: ['file-'],
        store: true,
      });

      expect(result.input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: 'Hello',
              prompt_cache_breakpoint: promptCacheBreakpoint,
            },
            {
              type: 'input_image',
              image_url: 'https://example.com/image.png',
              detail: undefined,
              prompt_cache_breakpoint: promptCacheBreakpoint,
            },
            {
              type: 'input_file',
              file_id: 'file-pdf-123',
              prompt_cache_breakpoint: promptCacheBreakpoint,
            },
          ],
        },
      ]);
    });

    it('should convert messages with image parts using URL', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Hello' },
              {
                type: 'file',
                mediaType: 'image/*',
                data: new URL('https://example.com/image.jpg'),
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: Buffer.from([0, 1, 2, 3]).toString('base64'),
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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

    it('should convert messages with image parts using Uint8Array', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: new Uint8Array([0, 1, 2, 3]),
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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

    it('should convert messages with image parts using file_id', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: 'file-12345',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        fileIdPrefixes: ['file-'],
        store: true,
      });

      expect(result.input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_image',
              file_id: 'file-12345',
            },
          ],
        },
      ]);
    });

    it('should use default mime type for binary images', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/*',
                data: Buffer.from([0, 1, 2, 3]).toString('base64'),
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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
      const result = await convertToOpenAIResponsesInput({
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
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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

      const result = await convertToOpenAIResponsesInput({
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
        store: true,
      });

      expect(result.input).toEqual([
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

    it('should convert messages with PDF file parts using file_id', async () => {
      const result = await convertToOpenAIResponsesInput({
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
        systemMessageMode: 'system',
        fileIdPrefixes: ['file-'],
        store: true,
      });

      expect(result.input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              file_id: 'file-pdf-12345',
            },
          ],
        },
      ]);
    });

    it('should use default filename for PDF file parts when not provided', async () => {
      const base64Data = 'AQIDBAU=';

      const result = await convertToOpenAIResponsesInput({
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
        store: true,
      });

      expect(result.input).toEqual([
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

      await expect(
        convertToOpenAIResponsesInput({
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
          store: true,
        }),
      ).rejects.toThrow('file part media type text/plain');
    });

    it('should convert PDF file parts with URL to input_file with file_url', async () => {
      const result = await convertToOpenAIResponsesInput({
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
        store: true,
      });

      expect(result.input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              file_url: 'https://example.com/document.pdf',
            },
          ],
        },
      ]);
    });

    describe('Azure OpenAI file ID support', () => {
      it('should convert image parts with assistant- prefix', async () => {
        const result = await convertToOpenAIResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: 'assistant-img-abc123',
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          fileIdPrefixes: ['assistant-'],
          store: true,
        });

        expect(result.input).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                file_id: 'assistant-img-abc123',
              },
            ],
          },
        ]);
      });

      it('should convert PDF parts with assistant- prefix', async () => {
        const result = await convertToOpenAIResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'application/pdf',
                  data: 'assistant-pdf-abc123',
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          fileIdPrefixes: ['assistant-'],
          store: true,
        });

        expect(result.input).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'input_file',
                file_id: 'assistant-pdf-abc123',
              },
            ],
          },
        ]);
      });

      it('should support multiple file ID prefixes', async () => {
        const result = await convertToOpenAIResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: 'assistant-img-abc123',
                },
                {
                  type: 'file',
                  mediaType: 'application/pdf',
                  data: 'file-pdf-xyz789',
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          fileIdPrefixes: ['assistant-', 'file-'],
          store: true,
        });

        expect(result.input).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                file_id: 'assistant-img-abc123',
              },
              {
                type: 'input_file',
                file_id: 'file-pdf-xyz789',
              },
            ],
          },
        ]);
      });
    });

    describe('fileIdPrefixes undefined behavior', () => {
      it('should treat all file data as base64 when fileIdPrefixes is undefined', async () => {
        const result = await convertToOpenAIResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: 'file-12345', // Looks like file ID but should be treated as base64
                },
                {
                  type: 'file',
                  mediaType: 'application/pdf',
                  data: 'assistant-abc123', // Looks like file ID but should be treated as base64
                  filename: 'test.pdf',
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          // fileIdPrefixes intentionally omitted
          store: true,
        });

        expect(result.input).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: 'data:image/png;base64,file-12345',
              },
              {
                type: 'input_file',
                filename: 'test.pdf',
                file_data: 'data:application/pdf;base64,assistant-abc123',
              },
            ],
          },
        ]);
      });

      it('should handle empty fileIdPrefixes array', async () => {
        const result = await convertToOpenAIResponsesInput({
          prompt: [
            {
              role: 'user',
              content: [
                {
                  type: 'file',
                  mediaType: 'image/png',
                  data: 'file-12345',
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          fileIdPrefixes: [], // Empty array should disable file ID detection
          store: true,
        });

        expect(result.input).toEqual([
          {
            role: 'user',
            content: [
              {
                type: 'input_image',
                image_url: 'data:image/png;base64,file-12345',
              },
            ],
          },
        ]);
      });
    });
  });

  describe('assistant messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          { role: 'assistant', content: [{ type: 'text', text: 'Hello' }] },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
        },
      ]);
    });

    it('should include phase from providerOptions on assistant text messages', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I will search for that',
                providerOptions: {
                  openai: {
                    itemId: 'msg_001',
                    phase: 'commentary',
                  },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: false,
      });

      expect(result.input).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'I will search for that' }],
          id: 'msg_001',
          phase: 'commentary',
        },
      ]);
    });

    it('should include final_answer phase from providerOptions on assistant text messages', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'The capital of France is Paris.',
                providerOptions: {
                  openai: {
                    itemId: 'msg_002',
                    phase: 'final_answer',
                  },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: false,
      });

      expect(result.input).toEqual([
        {
          role: 'assistant',
          content: [
            { type: 'output_text', text: 'The capital of France is Paris.' },
          ],
          id: 'msg_002',
          phase: 'final_answer',
        },
      ]);
    });

    it('should not include phase when not set in providerOptions', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hello',
                providerOptions: {
                  openai: {
                    itemId: 'msg_003',
                  },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: false,
      });

      expect(result.input).toEqual([
        {
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello' }],
          id: 'msg_003',
        },
      ]);
    });

    it('should convert messages with tool call parts', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              { type: 'text', text: 'I will search for that information.' },
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'search',
                input: { query: 'weather in San Francisco' },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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

    it('should convert messages with tool call parts that have ids', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I will search for that information.',
                providerOptions: {
                  openai: {
                    itemId: 'id_123',
                  },
                },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'search',
                input: { query: 'weather in San Francisco' },
                providerOptions: {
                  openai: {
                    itemId: 'id_456',
                  },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "id_123",
            "type": "item_reference",
          },
          {
            "id": "id_456",
            "type": "item_reference",
          },
        ]
      `);
    });

    it('should convert multiple tool call parts in a single message', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'search',
                input: { query: 'weather in San Francisco' },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_456',
                toolName: 'calculator',
                input: { expression: '2 + 2' },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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

    describe('reasoning messages (store: false)', () => {
      describe('single summary part', () => {
        it('should convert single reasoning part with text', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [
                {
                  type: 'summary_text',
                  text: 'Analyzing the problem step by step',
                },
              ],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should convert single reasoning part with encrypted content', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [
                {
                  type: 'summary_text',
                  text: 'Analyzing the problem step by step',
                },
              ],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should convert single reasoning part with null encrypted content', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [
                {
                  type: 'summary_text',
                  text: 'Analyzing the problem step by step',
                },
              ],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });
      });

      describe('single summary part with empty text', () => {
        it('should create empty summary for initial empty text', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: '', // Empty text should NOT generate warning when it's the first reasoning part
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should create empty summary for initial empty text with encrypted content', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: '', // Empty text should NOT generate warning when it's the first reasoning part
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should warn when appending empty text to existing sequence', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: '', // Empty text should generate warning when appending to existing reasoning sequence
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [
                {
                  type: 'summary_text',
                  text: 'First reasoning step',
                },
              ],
            },
          ]);

          expect(result.warnings).toMatchInlineSnapshot(`
            [
              {
                "message": "Cannot append empty reasoning part to existing reasoning sequence. Skipping reasoning part: {"type":"reasoning","text":"","providerOptions":{"openai":{"itemId":"reasoning_001","reasoningEncryptedContent":"encrypted_content_001"}}}.",
                "type": "other",
              },
            ]
          `);
        });
      });

      describe('merging and sequencing', () => {
        it('should merge consecutive parts with same reasoning ID', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        // encrypted content is stored in the last summary part
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toMatchInlineSnapshot(`
            [
              {
                "encrypted_content": "encrypted_content_001",
                "id": "reasoning_001",
                "summary": [
                  {
                    "text": "First reasoning step",
                    "type": "summary_text",
                  },
                  {
                    "text": "Second reasoning step",
                    "type": "summary_text",
                  },
                ],
                "type": "reasoning",
              },
            ]
          `);

          expect(result.warnings).toHaveLength(0);
        });

        it('should drop reasoning parts without encrypted content when store is false', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning step',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toMatchInlineSnapshot(`[]`);

          expect(result.warnings).toMatchInlineSnapshot(`
            [
              {
                "message": "Reasoning parts without encrypted content are not supported when store is false. Skipping reasoning parts.",
                "type": "other",
              },
            ]
          `);
        });

        it('should create separate messages for different reasoning IDs', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning block',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning block',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_002',
                        reasoningEncryptedContent: 'encrypted_content_002',
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [
                {
                  type: 'summary_text',
                  text: 'First reasoning block',
                },
              ],
            },
            {
              type: 'reasoning',
              id: 'reasoning_002',
              encrypted_content: 'encrypted_content_002',
              summary: [
                {
                  type: 'summary_text',
                  text: 'Second reasoning block',
                },
              ],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should handle reasoning across multiple assistant messages', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'First user question' }],
              },
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step (message 1)',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning step (message 1)',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  { type: 'text', text: 'First response' },
                ],
              },
              {
                role: 'user',
                content: [{ type: 'text', text: 'Second user question' }],
              },
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step (message 2)',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_002',
                      },
                    },
                  },
                  { type: 'text', text: 'Second response' },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: true,
          });

          expect(result.input).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "text": "First user question",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
              {
                "id": "reasoning_001",
                "type": "item_reference",
              },
              {
                "content": [
                  {
                    "text": "First response",
                    "type": "output_text",
                  },
                ],
                "id": undefined,
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "text": "Second user question",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
              {
                "id": "reasoning_002",
                "type": "item_reference",
              },
              {
                "content": [
                  {
                    "text": "Second response",
                    "type": "output_text",
                  },
                ],
                "id": undefined,
                "role": "assistant",
              },
            ]
          `);

          expect(result.warnings).toMatchInlineSnapshot(`[]`);
        });

        it('should handle reasoning across multiple assistant messages', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'user',
                content: [{ type: 'text', text: 'First user question' }],
              },
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step (message 1)',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning step (message 1)',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                  { type: 'text', text: 'First response' },
                ],
              },
              {
                role: 'user',
                content: [{ type: 'text', text: 'Second user question' }],
              },
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step (message 2)',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_002',
                        reasoningEncryptedContent: 'encrypted_content_002',
                      },
                    },
                  },
                  { type: 'text', text: 'Second response' },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toMatchInlineSnapshot(`
            [
              {
                "content": [
                  {
                    "text": "First user question",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
              {
                "encrypted_content": "encrypted_content_001",
                "id": "reasoning_001",
                "summary": [
                  {
                    "text": "First reasoning step (message 1)",
                    "type": "summary_text",
                  },
                  {
                    "text": "Second reasoning step (message 1)",
                    "type": "summary_text",
                  },
                ],
                "type": "reasoning",
              },
              {
                "content": [
                  {
                    "text": "First response",
                    "type": "output_text",
                  },
                ],
                "id": undefined,
                "role": "assistant",
              },
              {
                "content": [
                  {
                    "text": "Second user question",
                    "type": "input_text",
                  },
                ],
                "role": "user",
              },
              {
                "encrypted_content": "encrypted_content_002",
                "id": "reasoning_002",
                "summary": [
                  {
                    "text": "First reasoning step (message 2)",
                    "type": "summary_text",
                  },
                ],
                "type": "reasoning",
              },
              {
                "content": [
                  {
                    "text": "Second response",
                    "type": "output_text",
                  },
                ],
                "id": undefined,
                "role": "assistant",
              },
            ]
          `);

          expect(result.warnings).toHaveLength(0);
        });

        it('should handle complex reasoning sequences with tool interactions', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  // First reasoning block: reasoning → reasoning
                  {
                    type: 'reasoning',
                    text: 'Initial analysis step 1',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Initial analysis step 2',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: 'encrypted_content_001',
                      },
                    },
                  },
                  // First tool interaction: tool-call
                  {
                    type: 'tool-call',
                    toolCallId: 'call_001',
                    toolName: 'search',
                    input: { query: 'initial search' },
                  },
                ],
              },
              // Tool result comes as separate message
              {
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolCallId: 'call_001',
                    toolName: 'search',
                    output: {
                      type: 'json',
                      value: { results: ['result1', 'result2'] },
                    },
                  },
                ],
              },
              {
                role: 'assistant',
                content: [
                  // Second reasoning block: reasoning → reasoning → reasoning
                  {
                    type: 'reasoning',
                    text: 'Processing results step 1',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_002',
                        reasoningEncryptedContent: 'encrypted_content_002',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Processing results step 2',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_002',
                        reasoningEncryptedContent: 'encrypted_content_002',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Processing results step 3',
                    providerOptions: {
                      openai: {
                        itemId: 'reasoning_002',
                        reasoningEncryptedContent: 'encrypted_content_002',
                      },
                    },
                  },
                  // Second tool interaction: tool-call
                  {
                    type: 'tool-call',
                    toolCallId: 'call_002',
                    toolName: 'calculator',
                    input: { expression: '2 + 2' },
                  },
                ],
              },
              // Second tool result
              {
                role: 'tool',
                content: [
                  {
                    type: 'tool-result',
                    toolCallId: 'call_002',
                    toolName: 'calculator',
                    output: {
                      type: 'json',
                      value: { result: 4 },
                    },
                  },
                ],
              },
              {
                role: 'assistant',
                content: [
                  // Final text output
                  {
                    type: 'text',
                    text: 'Based on my analysis and calculations, here is the final answer.',
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toEqual([
            // First reasoning block (2 parts merged)
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [
                {
                  type: 'summary_text',
                  text: 'Initial analysis step 1',
                },
                {
                  type: 'summary_text',
                  text: 'Initial analysis step 2',
                },
              ],
            },
            // First tool call
            {
              type: 'function_call',
              call_id: 'call_001',
              name: 'search',
              arguments: JSON.stringify({ query: 'initial search' }),
            },
            // First tool result
            {
              type: 'function_call_output',
              call_id: 'call_001',
              output: JSON.stringify({ results: ['result1', 'result2'] }),
            },
            // Second reasoning block (3 parts merged)
            {
              type: 'reasoning',
              id: 'reasoning_002',
              encrypted_content: 'encrypted_content_002',
              summary: [
                {
                  type: 'summary_text',
                  text: 'Processing results step 1',
                },
                {
                  type: 'summary_text',
                  text: 'Processing results step 2',
                },
                {
                  type: 'summary_text',
                  text: 'Processing results step 3',
                },
              ],
            },
            // Second tool call
            {
              type: 'function_call',
              call_id: 'call_002',
              name: 'calculator',
              arguments: JSON.stringify({ expression: '2 + 2' }),
            },
            // Second tool result
            {
              type: 'function_call_output',
              call_id: 'call_002',
              output: JSON.stringify({ result: 4 }),
            },
            // Final text output
            {
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Based on my analysis and calculations, here is the final answer.',
                },
              ],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });
      });

      describe('error handling', () => {
        it('should warn when reasoning part has no provider options', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'This is a reasoning part without any provider options',
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toHaveLength(0);

          expect(result.warnings).toMatchInlineSnapshot(`
            [
              {
                "message": "Non-OpenAI reasoning parts are not supported. Skipping reasoning part: {"type":"reasoning","text":"This is a reasoning part without any provider options"}.",
                "type": "other",
              },
            ]
          `);
        });

        it('should warn when reasoning part lacks OpenAI-specific reasoning ID provider options', async () => {
          const result = await convertToOpenAIResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'This is a reasoning part without OpenAI-specific reasoning id provider options',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          encryptedContent: 'encrypted_content_001',
                        },
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
            store: false,
          });

          expect(result.input).toHaveLength(0);

          expect(result.warnings).toMatchInlineSnapshot(`
            [
              {
                "message": "Non-OpenAI reasoning parts are not supported. Skipping reasoning part: {"type":"reasoning","text":"This is a reasoning part without OpenAI-specific reasoning id provider options","providerOptions":{"openai":{"reasoning":{"encryptedContent":"encrypted_content_001"}}}}.",
                "type": "other",
              },
            ]
          `);
        });
      });
    });
  });

  describe('tool messages', () => {
    it('should add a prompt cache breakpoint to a text tool result', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'text',
                  value: 'Cached tool output',
                },
                providerOptions: {
                  openai: { promptCacheBreakpoint: { mode: 'explicit' } },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: [
            {
              type: 'input_text',
              text: 'Cached tool output',
              prompt_cache_breakpoint: { mode: 'explicit' },
            },
          ],
        },
      ]);
    });

    it('should place a tool-result-level breakpoint on the final nested output part', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'content',
                  value: [
                    { type: 'text', text: 'First part' },
                    {
                      type: 'media',
                      mediaType: 'image/png',
                      data: 'base64_data',
                    },
                  ],
                },
                providerOptions: {
                  openai: { promptCacheBreakpoint: { mode: 'explicit' } },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: [
            { type: 'input_text', text: 'First part' },
            {
              type: 'input_image',
              image_url: 'data:image/png;base64,base64_data',
              prompt_cache_breakpoint: { mode: 'explicit' },
            },
          ],
        },
      ]);
    });

    it('should convert single tool result part with json value', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'json',
                  value: { temperature: '72°F', condition: 'Sunny' },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": "{"temperature":"72°F","condition":"Sunny"}",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with text value', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'text',
                  value: 'The weather in San Francisco is 72°F',
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": "The weather in San Francisco is 72°F",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert execution-denied tool result to function_call_output', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_denied_123',
                toolName: 'search',
                output: {
                  type: 'execution-denied',
                  reason: 'User denied the tool execution',
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      expect(result.input).toEqual([
        {
          type: 'function_call_output',
          call_id: 'call_denied_123',
          output: 'User denied the tool execution',
        },
      ]);
    });

    it('should convert single tool result part with multipart that contains text', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'text',
                      text: 'The weather in San Francisco is 72°F',
                    },
                  ],
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": [
              {
                "text": "The weather in San Francisco is 72°F",
                "type": "input_text",
              },
            ],
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with multipart that contains image', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'media',
                      mediaType: 'image/png',
                      data: 'base64_data',
                    },
                  ],
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": [
              {
                "image_url": "data:image/png;base64,base64_data",
                "type": "input_image",
              },
            ],
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with multipart that contains file (PDF)', async () => {
      const base64Data = 'AQIDBAU=';
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'media',
                      mediaType: 'application/pdf',
                      data: base64Data,
                    },
                  ],
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": [
              {
                "file_data": "data:application/pdf;base64,AQIDBAU=",
                "filename": "data",
                "type": "input_file",
              },
            ],
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with multipart with mixed content (text, image, file)', async () => {
      const base64Data = 'AQIDBAU=';
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'content',
                  value: [
                    {
                      type: 'text',
                      text: 'The weather in San Francisco is 72°F',
                    },
                    {
                      type: 'media',
                      mediaType: 'image/png',
                      data: 'base64_data',
                    },
                    {
                      type: 'media',
                      mediaType: 'application/pdf',
                      data: base64Data,
                    },
                  ],
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_123",
            "output": [
              {
                "text": "The weather in San Francisco is 72°F",
                "type": "input_text",
              },
              {
                "image_url": "data:image/png;base64,base64_data",
                "type": "input_image",
              },
              {
                "file_data": "data:application/pdf;base64,AQIDBAU=",
                "filename": "data",
                "type": "input_file",
              },
            ],
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert multiple tool result parts in a single message', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'json',
                  value: { temperature: '72°F', condition: 'Sunny' },
                },
              },
              {
                type: 'tool-result',
                toolCallId: 'call_456',
                toolName: 'calculator',
                output: { type: 'json', value: 4 },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([
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

  describe('provider-defined tools', () => {
    it('should convert single provider-executed tool call and result into item reference with store: true', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                input: { code: 'example code', containerId: 'container_123' },
                providerExecuted: true,
                toolCallId:
                  'ci_68c2e2cf522c81908f3e2c1bccd1493b0b24aae9c6c01e4f',
                toolName: 'code_interpreter',
                type: 'tool-call',
              },
              {
                output: {
                  type: 'json',
                  value: {
                    outputs: [{ type: 'logs', logs: 'example logs' }],
                  },
                },
                toolCallId:
                  'ci_68c2e2cf522c81908f3e2c1bccd1493b0b24aae9c6c01e4f',
                toolName: 'code_interpreter',
                type: 'tool-result',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "ci_68c2e2cf522c81908f3e2c1bccd1493b0b24aae9c6c01e4f",
            "type": "item_reference",
          },
        ]
      `);
    });

    it('should exclude provider-executed tool calls and results from prompt with store: false', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Let me search for recent news from San Francisco.',
              },
              {
                type: 'tool-call',
                toolCallId: 'ws_67cf2b3051e88190b006770db6fdb13d',
                toolName: 'web_search',
                input: {
                  query: 'San Francisco major news events June 22 2025',
                },
                providerExecuted: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'ws_67cf2b3051e88190b006770db6fdb13d',
                toolName: 'web_search',
                output: {
                  type: 'json',
                  value: {
                    action: {
                      type: 'search',
                      query: 'San Francisco major news events June 22 2025',
                    },
                    sources: [
                      {
                        type: 'url',
                        url: 'https://patch.com/california/san-francisco/calendar',
                      },
                    ],
                  },
                },
              },
              {
                type: 'text',
                text: 'Based on the search results, several significant events took place in San Francisco yesterday (June 22, 2025).',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: false,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "content": [
                {
                  "text": "Let me search for recent news from San Francisco.",
                  "type": "output_text",
                },
              ],
              "id": undefined,
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "Based on the search results, several significant events took place in San Francisco yesterday (June 22, 2025).",
                  "type": "output_text",
                },
              ],
              "id": undefined,
              "role": "assistant",
            },
          ],
          "warnings": [
            {
              "message": "Results for OpenAI tool web_search are not sent to the API when store is false",
              "type": "other",
            },
          ],
        }
      `);
    });

    it('should skip provider-executed execution-denied tool results in assistant messages', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I need approval before running that tool.',
              },
              {
                type: 'tool-result',
                toolCallId: 'ws_denied_123',
                toolName: 'web_search',
                output: {
                  type: 'execution-denied',
                  reason: 'User denied the tool execution',
                },
              },
              {
                type: 'text',
                text: 'The tool was not run.',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: false,
      });

      expect(result).toEqual({
        input: [
          {
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I need approval before running that tool.',
              },
            ],
            id: undefined,
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'The tool was not run.',
              },
            ],
            id: undefined,
          },
        ],
        warnings: [],
      });
    });

    it('should skip json-wrapped execution-denied tool results in assistant messages', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'I need approval before running that tool.',
              },
              {
                type: 'tool-result',
                toolCallId: 'ws_denied_json_123',
                toolName: 'web_search',
                output: {
                  type: 'json',
                  value: {
                    type: 'execution-denied',
                    reason: 'User denied the tool execution',
                  },
                },
              },
              {
                type: 'text',
                text: 'The tool was not run.',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: false,
      });

      expect(result).toEqual({
        input: [
          {
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I need approval before running that tool.',
              },
            ],
            id: undefined,
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'The tool was not run.',
              },
            ],
            id: undefined,
          },
        ],
        warnings: [],
      });
    });

    describe('local shell', () => {
      it('should convert local shell tool call and result into item reference with store: true', async () => {
        const result = await convertToOpenAIResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_XWgeTylovOiS8xLNz2TONOgO',
                  toolName: 'local_shell',
                  input: { action: { type: 'exec', command: ['ls'] } },
                  providerOptions: {
                    openai: {
                      itemId:
                        'lsh_68c2e2cf522c81908f3e2c1bccd1493b0b24aae9c6c01e4f',
                    },
                  },
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_XWgeTylovOiS8xLNz2TONOgO',
                  toolName: 'local_shell',
                  output: { type: 'json', value: { output: 'example output' } },
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          store: true,
          hasLocalShellTool: true,
        });

        expect(result.input).toMatchInlineSnapshot(`
          [
            {
              "id": "lsh_68c2e2cf522c81908f3e2c1bccd1493b0b24aae9c6c01e4f",
              "type": "item_reference",
            },
            {
              "call_id": "call_XWgeTylovOiS8xLNz2TONOgO",
              "output": "example output",
              "type": "local_shell_call_output",
            },
          ]
        `);
      });

      it('should convert local shell tool call and result into item reference with store: false', async () => {
        const result = await convertToOpenAIResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_XWgeTylovOiS8xLNz2TONOgO',
                  toolName: 'local_shell',
                  input: { action: { type: 'exec', command: ['ls'] } },
                  providerOptions: {
                    openai: {
                      itemId:
                        'lsh_68c2e2cf522c81908f3e2c1bccd1493b0b24aae9c6c01e4f',
                    },
                  },
                },
              ],
            },
            {
              role: 'tool',
              content: [
                {
                  type: 'tool-result',
                  toolCallId: 'call_XWgeTylovOiS8xLNz2TONOgO',
                  toolName: 'local_shell',
                  output: { type: 'json', value: { output: 'example output' } },
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          store: false,
          hasLocalShellTool: true,
        });

        expect(result.input).toMatchInlineSnapshot(`
          [
            {
              "action": {
                "command": [
                  "ls",
                ],
                "env": undefined,
                "timeout_ms": undefined,
                "type": "exec",
                "user": undefined,
                "working_directory": undefined,
              },
              "call_id": "call_XWgeTylovOiS8xLNz2TONOgO",
              "id": "lsh_68c2e2cf522c81908f3e2c1bccd1493b0b24aae9c6c01e4f",
              "type": "local_shell_call",
            },
            {
              "call_id": "call_XWgeTylovOiS8xLNz2TONOgO",
              "output": "example output",
              "type": "local_shell_call_output",
            },
          ]
        `);
      });
    });
  });

  describe('function tools', () => {
    it('should include client-side tool calls in prompt', async () => {
      const result = await convertToOpenAIResponsesInput({
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call-1',
                toolName: 'calculator',
                input: { a: 1, b: 2 },
                providerExecuted: false,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "input": [
            {
              "arguments": "{"a":1,"b":2}",
              "call_id": "call-1",
              "id": undefined,
              "name": "calculator",
              "type": "function_call",
            },
          ],
          "warnings": [],
        }
      `);
    });
  });
<<<<<<< HEAD
=======

  describe('MCP tool approval responses', () => {
    it('should convert approved tool-approval-response to mcp_approval_response with store: true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'mcp-approval-123',
                approved: true,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "mcp-approval-123",
            "type": "item_reference",
          },
          {
            "approval_request_id": "mcp-approval-123",
            "approve": true,
            "type": "mcp_approval_response",
          },
        ]
      `);
    });

    it('should convert denied tool-approval-response to mcp_approval_response with store: true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'mcp-approval-456',
                approved: false,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "mcp-approval-456",
            "type": "item_reference",
          },
          {
            "approval_request_id": "mcp-approval-456",
            "approve": false,
            "type": "mcp_approval_response",
          },
        ]
      `);
    });

    it('should convert tool-approval-response to mcp_approval_response without item_reference when store: false', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'mcp-approval-789',
                approved: true,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: false,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "approval_request_id": "mcp-approval-789",
            "approve": true,
            "type": "mcp_approval_response",
          },
        ]
      `);
    });

    it('should skip duplicate tool-approval-response with same approvalId', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'duplicate-approval',
                approved: true,
              },
              {
                type: 'tool-approval-response',
                approvalId: 'duplicate-approval',
                approved: true,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "duplicate-approval",
            "type": "item_reference",
          },
          {
            "approval_request_id": "duplicate-approval",
            "approve": true,
            "type": "mcp_approval_response",
          },
        ]
      `);
    });

    it('should handle multiple different tool-approval-responses', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'approval-1',
                approved: true,
              },
              {
                type: 'tool-approval-response',
                approvalId: 'approval-2',
                approved: false,
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "approval-1",
            "type": "item_reference",
          },
          {
            "approval_request_id": "approval-1",
            "approve": true,
            "type": "mcp_approval_response",
          },
          {
            "id": "approval-2",
            "type": "item_reference",
          },
          {
            "approval_request_id": "approval-2",
            "approve": false,
            "type": "mcp_approval_response",
          },
        ]
      `);
    });

    it('should skip execution-denied output when it has approvalId in providerOptions', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'denied-approval',
                approved: false,
              },
              {
                type: 'tool-result',
                toolCallId: 'call-123',
                toolName: 'mcp_tool',
                output: {
                  type: 'execution-denied',
                  reason: 'User denied the tool execution',
                  providerOptions: {
                    openai: {
                      approvalId: 'denied-approval',
                    },
                  },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      // Only the mcp_approval_response should be present, not a function_call_output
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "denied-approval",
            "type": "item_reference",
          },
          {
            "approval_request_id": "denied-approval",
            "approve": false,
            "type": "mcp_approval_response",
          },
        ]
      `);
    });

    it('should handle tool-approval-response mixed with regular tool results', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'approval-for-mcp',
                approved: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'regular-call-1',
                toolName: 'calculator',
                output: {
                  type: 'json',
                  value: { result: 42 },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "approval-for-mcp",
            "type": "item_reference",
          },
          {
            "approval_request_id": "approval-for-mcp",
            "approve": true,
            "type": "mcp_approval_response",
          },
          {
            "call_id": "regular-call-1",
            "output": "{"result":42}",
            "type": "function_call_output",
          },
        ]
      `);
    });
  });

  describe('hasConversation', () => {
    it('should skip assistant text messages with item IDs when hasConversation is true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hi there!',
                providerOptions: { openai: { itemId: 'msg_existing_123' } },
              },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the weather?' }],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        hasConversation: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "text": "What is the weather?",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });

    it('should skip assistant tool-call messages with item IDs when hasConversation is true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'What is the weather?' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'getWeather',
                input: { location: 'San Francisco' },
                providerOptions: {
                  openai: { itemId: 'fc_existing_456' },
                },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'getWeather',
                output: { type: 'json', value: { temp: 72 } },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        hasConversation: true,
      });

      // Tool call with itemId should be skipped, but tool output should remain
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "What is the weather?",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
          {
            "call_id": "call_123",
            "output": "{"temp":72}",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should include assistant messages without item IDs when hasConversation is true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hi there!',
                // No itemId - this is a new message
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        hasConversation: true,
      });

      // Assistant message without itemId should be included
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
          {
            "content": [
              {
                "text": "Hi there!",
                "type": "output_text",
              },
            ],
            "id": undefined,
            "role": "assistant",
          },
        ]
      `);
    });

    it('should include assistant messages with item IDs when hasConversation is false', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hi there!',
                providerOptions: { openai: { itemId: 'msg_existing_123' } },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        hasConversation: false,
      });

      // With hasConversation false, should use item_reference
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
          {
            "id": "msg_existing_123",
            "type": "item_reference",
          },
        ]
      `);
    });

    it('should skip reasoning parts with item IDs when hasConversation is true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'Let me think...',
                providerOptions: {
                  openai: { itemId: 'reasoning_existing_789' },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        hasConversation: true,
      });

      // Reasoning with itemId should be skipped
      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });
  });

  describe('hasPreviousResponseId', () => {
    it('should keep text item references and skip function call item references when hasPreviousResponseId is true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: 'Hi there!',
                providerOptions: { openai: { itemId: 'msg_existing_123' } },
              },
              {
                type: 'tool-call',
                toolCallId: 'call_123',
                toolName: 'getWeather',
                input: { location: 'San Francisco' },
                providerOptions: {
                  openai: { itemId: 'fc_existing_456' },
                },
              },
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'getWeather',
                output: { type: 'json', value: { temp: 72 } },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        hasPreviousResponseId: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
          {
            "id": "msg_existing_123",
            "type": "item_reference",
          },
          {
            "call_id": "call_123",
            "output": "{"temp":72}",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should skip reasoning parts with item IDs when hasPreviousResponseId is true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'reasoning',
                text: 'Let me think...',
                providerOptions: {
                  openai: { itemId: 'rs_existing_789' },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        hasPreviousResponseId: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "content": [
              {
                "text": "Hello",
                "type": "input_text",
              },
            ],
            "role": "user",
          },
        ]
      `);
    });
  });

  describe('custom tool calls', () => {
    const customProviderToolNames = new Set(['write_sql']);

    it('should convert custom tool call to custom_tool_call input item', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_custom_001',
                toolName: 'write_sql',
                input: 'SELECT * FROM users WHERE age > 25',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_custom_001",
            "id": undefined,
            "input": "SELECT * FROM users WHERE age > 25",
            "name": "write_sql",
            "type": "custom_tool_call",
          },
        ]
      `);
    });

    it('should JSON.stringify non-string custom tool call input', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_custom_002',
                toolName: 'write_sql',
                input: { query: 'test' },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_custom_002",
            "id": undefined,
            "input": "{"query":"test"}",
            "name": "write_sql",
            "type": "custom_tool_call",
          },
        ]
      `);
    });

    it('should convert custom tool call with itemId to item_reference when store: true', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_custom_003',
                toolName: 'write_sql',
                input: 'SELECT 1',
                providerOptions: {
                  openai: {
                    itemId: 'ct_ref_123',
                  },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "id": "ct_ref_123",
            "type": "item_reference",
          },
        ]
      `);
    });

    it('should convert custom tool result to custom_tool_call_output with text value', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_custom_001',
                toolName: 'write_sql',
                output: {
                  type: 'text',
                  value: 'Query executed successfully. 42 rows returned.',
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_custom_001",
            "output": "Query executed successfully. 42 rows returned.",
            "type": "custom_tool_call_output",
          },
        ]
      `);
    });

    it('should convert custom tool result to custom_tool_call_output with json value', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_custom_002',
                toolName: 'write_sql',
                output: {
                  type: 'json',
                  value: { rows: 42, status: 'ok' },
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_custom_002",
            "output": "{"rows":42,"status":"ok"}",
            "type": "custom_tool_call_output",
          },
        ]
      `);
    });

    it('should convert aliased tool name to provider custom tool name', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: {
          toProviderToolName: name =>
            name === 'alias_name' ? 'write_sql' : name,
          toCustomToolName: name =>
            name === 'write_sql' ? 'alias_name' : name,
        },
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_custom_004',
                toolName: 'alias_name',
                input: 'SELECT 1',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_custom_004",
            "id": undefined,
            "input": "SELECT 1",
            "name": "write_sql",
            "type": "custom_tool_call",
          },
        ]
      `);
    });

    it('should convert execution-denied custom tool result to custom_tool_call_output', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_custom_denied_001',
                toolName: 'write_sql',
                output: {
                  type: 'execution-denied',
                  reason: 'User denied the tool execution',
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toEqual([
        {
          type: 'custom_tool_call_output',
          call_id: 'call_custom_denied_001',
          output: 'User denied the tool execution',
        },
      ]);
    });

    it('should convert custom tool result content output', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_custom_005',
                toolName: 'write_sql',
                output: {
                  type: 'content',
                  value: [{ type: 'text', text: 'hello' }],
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_custom_005",
            "output": [
              {
                "text": "hello",
                "type": "input_text",
              },
            ],
            "type": "custom_tool_call_output",
          },
        ]
      `);
    });

    it('should convert custom tool result content output with file-url', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_custom_006',
                toolName: 'write_sql',
                output: {
                  type: 'content',
                  value: [
                    { type: 'text', text: 'Here is the file:' },
                    { type: 'file-url', url: 'https://example.com/test.pdf' },
                  ],
                },
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
        customProviderToolNames,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "call_id": "call_custom_006",
            "output": [
              {
                "text": "Here is the file:",
                "type": "input_text",
              },
              {
                "file_url": "https://example.com/test.pdf",
                "type": "input_file",
              },
            ],
            "type": "custom_tool_call_output",
          },
        ]
      `);
      expect(result.warnings).toEqual([]);
    });

    it('should not emit custom_tool_call when customProviderToolNames is not provided', async () => {
      const result = await convertToOpenAIResponsesInput({
        toolNameMapping: testToolNameMapping,
        prompt: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_custom_001',
                toolName: 'write_sql',
                input: 'SELECT 1',
              },
            ],
          },
        ],
        systemMessageMode: 'system',
        providerOptionsName: 'openai',
        store: true,
      });

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "arguments": ""SELECT 1"",
            "call_id": "call_custom_001",
            "name": "write_sql",
            "type": "function_call",
          },
        ]
      `);
    });
  });
>>>>>>> 327642b278 ([v6.0] fix: more precise default message for tool execution denial (#16804))
});

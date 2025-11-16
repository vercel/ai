import { convertToOpenAICompatibleResponsesInput } from './convert-to-openai-compatible-responses-input';
import { describe, it, expect } from 'vitest';

describe('convertToOpenAICompatibleResponsesInput', () => {
  describe('system messages', () => {
    it('should convert system messages to system role', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'system',
        store: true,
      });

      expect(result.input).toEqual([{ role: 'system', content: 'Hello' }]);
    });

    it('should convert system messages to developer role', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'developer',
        store: true,
      });

      expect(result.input).toEqual([{ role: 'developer', content: 'Hello' }]);
    });
  });

  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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

    it('should convert messages with image parts using URL', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
              detail: undefined,
            },
          ],
        },
      ]);
    });

    it('should convert messages with image parts using binary data', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
              detail: undefined,
            },
          ],
        },
      ]);
    });

    it('should convert messages with image parts using Uint8Array', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
              detail: undefined,
            },
          ],
        },
      ]);
    });

    it('should use default mime type for binary images', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
              detail: undefined,
            },
          ],
        },
      ]);
    });

    it('should add image detail when specified through extension', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
        prompt: [
          {
            role: 'user',
            content: [
              {
                type: 'file',
                mediaType: 'image/png',
                data: Buffer.from([0, 1, 2, 3]).toString('base64'),
                providerOptions: {
                  openaiCompatibleResponses: {
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
      const base64Data = 'AQIDBAU=';

      const result = await convertToOpenAICompatibleResponsesInput({
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
      const result = await convertToOpenAICompatibleResponsesInput({
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
        store: true,
      });

      expect(result.input).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'input_file',
              file_data: 'data:application/pdf;base64,file-pdf-12345',
              filename: 'part-0.pdf',
            },
          ],
        },
      ]);
    });

    it('should use default filename for PDF file parts when not provided', async () => {
      const base64Data = 'AQIDBAU=';

      const result = await convertToOpenAICompatibleResponsesInput({
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
        convertToOpenAICompatibleResponsesInput({
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
      const result = await convertToOpenAICompatibleResponsesInput({
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
  });

  describe('assistant messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
          id: undefined,
        },
      ]);
    });

    it('should convert messages with tool call parts', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
          id: undefined,
        },
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'search',
          arguments: JSON.stringify({ query: 'weather in San Francisco' }),
          id: undefined,
        },
      ]);
    });

    it('should convert multiple tool call parts in a single message', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
          id: undefined,
        },
        {
          type: 'function_call',
          call_id: 'call_456',
          name: 'calculator',
          arguments: JSON.stringify({ expression: '2 + 2' }),
          id: undefined,
        },
      ]);
    });

    describe('reasoning messages (store: false)', () => {
      describe('single summary part', () => {
        it('should convert single reasoning part with text', async () => {
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openaiCompatibleResponses: {
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

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: undefined,
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
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openaiCompatibleResponses: {
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
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openaiCompatibleResponses: {
                        itemId: 'reasoning_001',
                        reasoningEncryptedContent: null,
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
              encrypted_content: null,
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
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: '',
                    providerOptions: {
                      openaiCompatibleResponses: {
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

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: undefined,
              summary: [],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should create empty summary for initial empty text with encrypted content', async () => {
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: '',
                    providerOptions: {
                      openaiCompatibleResponses: {
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
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step',
                    providerOptions: {
                      openaiCompatibleResponses: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: '',
                    providerOptions: {
                      openaiCompatibleResponses: {
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

          expect(result.input).toEqual([
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: undefined,
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
                "message": "Cannot append empty reasoning part to existing reasoning sequence. Skipping reasoning part: {"type":"reasoning","text":"","providerOptions":{"openaiCompatibleResponses":{"itemId":"reasoning_001"}}}.",
                "type": "other",
              },
            ]
          `);
        });
      });

      describe('merging and sequencing', () => {
        it('should merge consecutive parts with same reasoning ID', async () => {
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step',
                    providerOptions: {
                      openaiCompatibleResponses: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning step',
                    providerOptions: {
                      openaiCompatibleResponses: {
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

        it('should create separate messages for different reasoning IDs', async () => {
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning block',
                    providerOptions: {
                      openaiCompatibleResponses: {
                        itemId: 'reasoning_001',
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning block',
                    providerOptions: {
                      openaiCompatibleResponses: {
                        itemId: 'reasoning_002',
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
              encrypted_content: undefined,
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
              encrypted_content: undefined,
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
      });

      describe('error handling', () => {
        it('should warn when reasoning part has no provider options', async () => {
          const result = await convertToOpenAICompatibleResponsesInput({
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

        it('should warn when reasoning part lacks reasoning ID provider options', async () => {
          const result = await convertToOpenAICompatibleResponsesInput({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'This is a reasoning part without reasoning id provider options',
                    providerOptions: {
                      openaiCompatibleResponses: {
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

          expect(result.input).toHaveLength(0);

          expect(result.warnings).toMatchInlineSnapshot(`
            [
              {
                "message": "Non-OpenAI reasoning parts are not supported. Skipping reasoning part: {"type":"reasoning","text":"This is a reasoning part without reasoning id provider options","providerOptions":{"openaiCompatibleResponses":{"reasoningEncryptedContent":"encrypted_content_001"}}}.",
                "type": "other",
              },
            ]
          `);
        });
      });
    });

    describe('reasoning messages (store: true)', () => {
      it('should use item reference when store is true', async () => {
        const result = await convertToOpenAICompatibleResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'Analyzing the problem step by step',
                  providerOptions: {
                    openaiCompatibleResponses: {
                      itemId: 'reasoning_001',
                    },
                  },
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          store: true,
        });

        expect(result.warnings).toHaveLength(0);
      });

      it('should only use one item reference for multiple parts with same ID', async () => {
        const result = await convertToOpenAICompatibleResponsesInput({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'First step',
                  providerOptions: {
                    openaiCompatibleResponses: {
                      itemId: 'reasoning_001',
                    },
                  },
                },
                {
                  type: 'reasoning',
                  text: 'Second step',
                  providerOptions: {
                    openaiCompatibleResponses: {
                      itemId: 'reasoning_001',
                    },
                  },
                },
              ],
            },
          ],
          systemMessageMode: 'system',
          store: true,
        });

        expect(result.warnings).toHaveLength(0);
      });
    });
  });

  describe('tool messages', () => {
    it('should convert single tool result part with json value', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
      const result = await convertToOpenAICompatibleResponsesInput({
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

    it('should convert single tool result part with error-text value', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'error-text',
                  value: 'Search service unavailable',
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
            "output": "Search service unavailable",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with error-json value', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'error-json',
                  value: { error: 'Service unavailable', code: 503 },
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
            "output": "{"error":"Service unavailable","code":503}",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with execution-denied value', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'execution-denied',
                  reason: 'User denied tool execution',
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
            "output": "User denied tool execution",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with execution-denied value without reason', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
        prompt: [
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: 'call_123',
                toolName: 'search',
                output: {
                  type: 'execution-denied',
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
            "output": "Tool execution denied.",
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with multipart that contains text', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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
      const result = await convertToOpenAICompatibleResponsesInput({
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
                      type: 'image-data',
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
      const result = await convertToOpenAICompatibleResponsesInput({
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
                      type: 'file-data',
                      mediaType: 'application/pdf',
                      data: base64Data,
                      filename: 'document.pdf',
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
                "filename": "document.pdf",
                "type": "input_file",
              },
            ],
            "type": "function_call_output",
          },
        ]
      `);
    });

    it('should convert single tool result part with multipart with mixed content', async () => {
      const base64Data = 'AQIDBAU=';
      const result = await convertToOpenAICompatibleResponsesInput({
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
                      type: 'image-data',
                      mediaType: 'image/png',
                      data: 'base64_data',
                    },
                    {
                      type: 'file-data',
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
      const result = await convertToOpenAICompatibleResponsesInput({
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

  describe('client-side tool calls', () => {
    it('should include client-side tool calls in prompt', async () => {
      const result = await convertToOpenAICompatibleResponsesInput({
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

      expect(result.input).toMatchInlineSnapshot(`
        [
          {
            "arguments": "{"a":1,"b":2}",
            "call_id": "call-1",
            "id": undefined,
            "name": "calculator",
            "type": "function_call",
          },
        ]
      `);
    });
  });
});

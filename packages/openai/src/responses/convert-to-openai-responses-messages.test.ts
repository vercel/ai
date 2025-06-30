import { convertToOpenAIResponsesMessages } from './convert-to-openai-responses-messages';

describe('convertToOpenAIResponsesMessages', () => {
  describe('system messages', () => {
    it('should convert system messages to system role', async () => {
      const result = await convertToOpenAIResponsesMessages({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'system',
      });

      expect(result.messages).toEqual([{ role: 'system', content: 'Hello' }]);
    });

    it('should convert system messages to developer role', async () => {
      const result = await convertToOpenAIResponsesMessages({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'developer',
      });

      expect(result.messages).toEqual([
        { role: 'developer', content: 'Hello' },
      ]);
    });

    it('should remove system messages', async () => {
      const result = await convertToOpenAIResponsesMessages({
        prompt: [{ role: 'system', content: 'Hello' }],
        systemMessageMode: 'remove',
      });

      expect(result.messages).toEqual([]);
    });
  });

  describe('user messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToOpenAIResponsesMessages({
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
      const result = await convertToOpenAIResponsesMessages({
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
      const result = await convertToOpenAIResponsesMessages({
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
      const result = await convertToOpenAIResponsesMessages({
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
      const result = await convertToOpenAIResponsesMessages({
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

      const result = await convertToOpenAIResponsesMessages({
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

      const result = await convertToOpenAIResponsesMessages({
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
        convertToOpenAIResponsesMessages({
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
        }),
      ).rejects.toThrow('file part media type text/plain');
    });

    it('should throw error for file URLs', async () => {
      await expect(
        convertToOpenAIResponsesMessages({
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
        }),
      ).rejects.toThrow('PDF file parts with URLs');
    });
  });

  describe('assistant messages', () => {
    it('should convert messages with only a text part to a string content', async () => {
      const result = await convertToOpenAIResponsesMessages({
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
      const result = await convertToOpenAIResponsesMessages({
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
      const result = await convertToOpenAIResponsesMessages({
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

    describe('reasoning messages', () => {
      it('should convert reasoning part to OpenAI reasoning message format', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'This is my reasoning summary',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: undefined,
            summary: [
              {
                type: 'summary_text',
                text: 'This is my reasoning summary',
              },
            ],
          },
        ]);
      });

      it('should include encrypted content when provided in reasoning part', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'This is my reasoning summary',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                        encryptedContent: 'encrypted_content_abc',
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: 'encrypted_content_abc',
            summary: [
              {
                type: 'summary_text',
                text: 'This is my reasoning summary',
              },
            ],
          },
        ]);
      });

      it('should include null encrypted content when explicitly set to null in reasoning part', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'This is my reasoning summary',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                        encryptedContent: null,
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: null,
            summary: [
              {
                type: 'summary_text',
                text: 'This is my reasoning summary',
              },
            ],
          },
        ]);
      });

      it('should create reasoning message with empty summary when text is empty', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: '',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: undefined,
            summary: [],
          },
        ]);
      });

      it('should merge multiple reasoning parts with same ID into single reasoning message', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'First reasoning part',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
                    },
                  },
                },
                {
                  type: 'reasoning',
                  text: 'Second reasoning part',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: undefined,
            summary: [
              {
                type: 'summary_text',
                text: 'First reasoning part',
              },
              {
                type: 'summary_text',
                text: 'Second reasoning part',
              },
            ],
          },
        ]);
      });

      it('should merge reasoning parts with same ID across different assistant messages', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'First part',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
                    },
                  },
                },
              ],
            },
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'Second part',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: undefined,
            summary: [
              {
                type: 'summary_text',
                text: 'First part',
              },
              {
                type: 'summary_text',
                text: 'Second part',
              },
            ],
          },
        ]);
      });

      it('should only add non-empty text to reasoning summary when merging', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'First reasoning part',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
                    },
                  },
                },
                {
                  type: 'reasoning',
                  text: '', // Empty text should not add summary
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: undefined,
            summary: [
              {
                type: 'summary_text',
                text: 'First reasoning part',
              },
            ],
          },
        ]);
      });

      it('should create separate reasoning messages for different reasoning IDs', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'First reasoning',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
                    },
                  },
                },
                {
                  type: 'reasoning',
                  text: 'Second reasoning',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_456',
                      },
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
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: undefined,
            summary: [
              {
                type: 'summary_text',
                text: 'First reasoning',
              },
            ],
          },
          {
            type: 'reasoning',
            id: 'reasoning_456',
            encrypted_content: undefined,
            summary: [
              {
                type: 'summary_text',
                text: 'Second reasoning',
              },
            ],
          },
        ]);
      });

      it('should separate reasoning and text content into different messages', async () => {
        const result = await convertToOpenAIResponsesMessages({
          prompt: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'reasoning',
                  text: 'This is my reasoning',
                  providerOptions: {
                    openai: {
                      reasoning: {
                        id: 'reasoning_123',
                      },
                    },
                  },
                },
                { type: 'text', text: 'Here is my response' },
              ],
            },
          ],
          systemMessageMode: 'system',
        });

        expect(result.messages).toEqual([
          {
            type: 'reasoning',
            id: 'reasoning_123',
            encrypted_content: undefined,
            summary: [
              {
                type: 'summary_text',
                text: 'This is my reasoning',
              },
            ],
          },
          {
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Here is my response' }],
          },
        ]);
      });

      it('should throw error when reasoning part lacks required provider options', async () => {
        await expect(
          convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Test reasoning',
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
          }),
        ).rejects.toThrow(
          'Reasoning parts require providerOptions: { openai: { reasoning: { id: "..." } } }',
        );
      });

      it('should throw error when reasoning parts with same ID have mismatched encrypted content', async () => {
        await expect(
          convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning part',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_123',
                          encryptedContent: 'encrypted_content_abc',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning part',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_123',
                          encryptedContent: 'encrypted_content_xyz',
                        },
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
          }),
        ).rejects.toThrow(
          'Reasoning parts with same ID must have matching encrypted content',
        );
      });

      it('should throw error when mixing encrypted and non-encrypted reasoning parts with same ID', async () => {
        await expect(
          convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning part',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_123',
                          encryptedContent: 'encrypted_content_abc',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning part',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_123',
                          // No encryptedContent - should cause mismatch
                        },
                      },
                    },
                  },
                ],
              },
            ],
            systemMessageMode: 'system',
          }),
        ).rejects.toThrow(
          'Reasoning parts with same ID must have matching encrypted content',
        );
      });
    });
  });

  describe('tool messages', () => {
    it('should convert tool result parts', async () => {
      const result = await convertToOpenAIResponsesMessages({
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
      const result = await convertToOpenAIResponsesMessages({
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

  describe('provider-executed tool calls', () => {
    it('should exclude provider-executed tool calls and results from prompt', async () => {
      const result = await convertToOpenAIResponsesMessages({
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
                toolName: 'web_search_preview',
                input: {
                  query: 'San Francisco major news events June 22 2025',
                },
                providerExecuted: true,
              },
              {
                type: 'tool-result',
                toolCallId: 'ws_67cf2b3051e88190b006770db6fdb13d',
                toolName: 'web_search_preview',
                output: {
                  type: 'json',
                  value: [
                    {
                      url: 'https://patch.com/california/san-francisco/calendar',
                    },
                  ],
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
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "content": [
                {
                  "text": "Let me search for recent news from San Francisco.",
                  "type": "output_text",
                },
              ],
              "role": "assistant",
            },
            {
              "content": [
                {
                  "text": "Based on the search results, several significant events took place in San Francisco yesterday (June 22, 2025).",
                  "type": "output_text",
                },
              ],
              "role": "assistant",
            },
          ],
          "warnings": [
            {
              "message": "tool result parts in assistant messages are not supported for OpenAI responses",
              "type": "other",
            },
          ],
        }
      `);
    });

    it('should include client-side tool calls in prompt', async () => {
      const result = await convertToOpenAIResponsesMessages({
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
      });

      expect(result).toMatchInlineSnapshot(`
        {
          "messages": [
            {
              "arguments": "{"a":1,"b":2}",
              "call_id": "call-1",
              "name": "calculator",
              "type": "function_call",
            },
          ],
          "warnings": [],
        }
      `);
    });
  });
});

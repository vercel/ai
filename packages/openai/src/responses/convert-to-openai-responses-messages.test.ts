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
      describe('basic conversion', () => {
        it('should convert single reasoning part with text', async () => {
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
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
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
                          encryptedContent: 'encrypted_content_001',
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
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'Analyzing the problem step by step',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
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

      describe('empty text handling', () => {
        it('should create empty summary for initial empty text', async () => {
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: '', // Empty text should NOT generate warning when it's the first reasoning part
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
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
              id: 'reasoning_001',
              encrypted_content: undefined,
              summary: [],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should create empty summary for initial empty text with encrypted content', async () => {
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: '', // Empty text should NOT generate warning when it's the first reasoning part
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
                          encryptedContent: 'encrypted_content_001',
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
              id: 'reasoning_001',
              encrypted_content: 'encrypted_content_001',
              summary: [],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should warn when appending empty text to existing sequence', async () => {
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: '', // Empty text should generate warning when appending to existing reasoning sequence
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
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
                "message": "Cannot append empty reasoning part to existing reasoning sequence. Skipping reasoning part: {"type":"reasoning","text":"","providerOptions":{"openai":{"reasoning":{"id":"reasoning_001"}}}}.",
                "type": "other",
              },
            ]
          `);
        });
      });

      describe('merging and sequencing', () => {
        it('should merge consecutive parts with same reasoning ID', async () => {
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning step',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning step',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
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
              id: 'reasoning_001',
              encrypted_content: undefined,
              summary: [
                {
                  type: 'summary_text',
                  text: 'First reasoning step',
                },
                {
                  type: 'summary_text',
                  text: 'Second reasoning step',
                },
              ],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should create separate messages for different reasoning IDs', async () => {
          const result = await convertToOpenAIResponsesMessages({
            prompt: [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'reasoning',
                    text: 'First reasoning block',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning block',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_002',
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

        it('should handle reasoning across multiple assistant messages', async () => {
          const result = await convertToOpenAIResponsesMessages({
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
                        reasoning: {
                          id: 'reasoning_001',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Second reasoning step (message 1)',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
                        },
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
                        reasoning: {
                          id: 'reasoning_002',
                        },
                      },
                    },
                  },
                  { type: 'text', text: 'Second response' },
                ],
              },
            ],
            systemMessageMode: 'system',
          });

          expect(result.messages).toEqual([
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'First user question' }],
            },
            {
              type: 'reasoning',
              id: 'reasoning_001',
              encrypted_content: undefined,
              summary: [
                {
                  type: 'summary_text',
                  text: 'First reasoning step (message 1)',
                },
                {
                  type: 'summary_text',
                  text: 'Second reasoning step (message 1)',
                },
              ],
            },
            {
              role: 'assistant',
              content: [{ type: 'output_text', text: 'First response' }],
            },
            {
              role: 'user',
              content: [{ type: 'input_text', text: 'Second user question' }],
            },
            {
              type: 'reasoning',
              id: 'reasoning_002',
              encrypted_content: undefined,
              summary: [
                {
                  type: 'summary_text',
                  text: 'First reasoning step (message 2)',
                },
              ],
            },
            {
              role: 'assistant',
              content: [{ type: 'output_text', text: 'Second response' }],
            },
          ]);

          expect(result.warnings).toHaveLength(0);
        });

        it('should handle complex reasoning sequences with tool interactions', async () => {
          const result = await convertToOpenAIResponsesMessages({
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
                        reasoning: {
                          id: 'reasoning_001',
                          encryptedContent: 'encrypted_content_001',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Initial analysis step 2',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_001',
                          encryptedContent: 'encrypted_content_001',
                        },
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
                        reasoning: {
                          id: 'reasoning_002',
                          encryptedContent: 'encrypted_content_002',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Processing results step 2',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_002',
                          encryptedContent: 'encrypted_content_002',
                        },
                      },
                    },
                  },
                  {
                    type: 'reasoning',
                    text: 'Processing results step 3',
                    providerOptions: {
                      openai: {
                        reasoning: {
                          id: 'reasoning_002',
                          encryptedContent: 'encrypted_content_002',
                        },
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
          });

          expect(result.messages).toEqual([
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
          const result = await convertToOpenAIResponsesMessages({
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
          });

          expect(result.messages).toHaveLength(0);

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
          const result = await convertToOpenAIResponsesMessages({
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
          });

          expect(result.messages).toHaveLength(0);

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

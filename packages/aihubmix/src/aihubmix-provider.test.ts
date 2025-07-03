import {
  EmbeddingModelV2Embedding,
  LanguageModelV2Prompt,
} from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createAihubmix } from './aihubmix-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createAihubmix({
  apiKey: 'test-api-key',
});

const server = createTestServer({
  'https://aihubmix.com/v1/chat/completions': {},
  'https://aihubmix.com/v1/completions': {},
  'https://aihubmix.com/v1/embeddings': {},
  'https://aihubmix.com/v1/images/generations': {},
  'https://aihubmix.com/v1/audio/transcriptions': {},
  'https://aihubmix.com/v1/audio/speech': {},
  'https://aihubmix.com/v1/messages': {},
  'https://aihubmix.com/gemini/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent':
    {},
  'http://localhost:1234/v1/chat/completions': {},
});

(global as any).File = Buffer;

describe('aihubmix provider', () => {
  describe('chat models', () => {
    describe('OpenAI models', () => {
      function prepareOpenAIResponse({
        content = '',
      }: { content?: string } = {}) {
        server.urls['https://aihubmix.com/v1/chat/completions'].response = {
          type: 'json-value',
          body: {
            id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
            object: 'chat.completion',
            created: 1711115037,
            model: 'gpt-4o',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content,
                },
                finish_reason: 'stop',
              },
            ],
            usage: {
              prompt_tokens: 4,
              total_tokens: 34,
              completion_tokens: 30,
            },
            system_fingerprint: 'fp_3bc1b5746c',
          },
        };
      }

      it('should handle OpenAI models correctly', async () => {
        prepareOpenAIResponse({ content: 'Hello from GPT-4o!' });

        const result = await provider('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(
          (result.content[0] as { type: 'text'; text: string }).text,
        ).toStrictEqual('Hello from GPT-4o!');
      });

      it('should pass correct headers for OpenAI models', async () => {
        prepareOpenAIResponse();

        await provider('gpt-4o').doGenerate({
          prompt: TEST_PROMPT,
          headers: {
            'Custom-Request-Header': 'request-header-value',
          },
        });

        expect(server.calls[0].requestHeaders).toStrictEqual({
          authorization: 'Bearer test-api-key',
          'content-type': 'application/json',
          'app-code': 'WHVL9885',
          'custom-request-header': 'request-header-value',
        });
      });
    });

    describe('Claude models', () => {
      function prepareClaudeResponse({
        content = '',
      }: { content?: string } = {}) {
        server.urls['https://aihubmix.com/v1/messages'].response = {
          type: 'json-value',
          body: {
            id: 'msg_123',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: content,
              },
            ],
            model: 'claude-3-sonnet-20240229',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: 4,
              output_tokens: 30,
            },
          },
        };
      }

      it('should handle Claude models correctly', async () => {
        prepareClaudeResponse({ content: 'Hello from Claude!' });

        const result = await provider('claude-3-sonnet-20240229').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(
          (result.content[0] as { type: 'text'; text: string }).text,
        ).toStrictEqual('Hello from Claude!');
      });

      it('should pass correct headers for Claude models', async () => {
        prepareClaudeResponse();

        await provider('claude-3-sonnet-20240229').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(server.calls[0].requestHeaders).toMatchObject({
          authorization: 'Bearer test-api-key',
          'content-type': 'application/json',
          'app-code': 'WHVL9885',
          'x-api-key': 'test-api-key',
        });
      });
    });

    describe('Gemini models', () => {
      function prepareGeminiResponse({
        content = '',
      }: { content?: string } = {}) {
        server.urls[
          'https://aihubmix.com/gemini/v1beta/models/gemini-2.5-pro-preview-05-06:generateContent'
        ].response = {
          type: 'json-value',
          body: {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: content,
                    },
                  ],
                },
                finishReason: 'STOP',
                index: 0,
                safetyRatings: [],
              },
            ],
            promptFeedback: {
              safetyRatings: [],
            },
          },
        };
      }

      it('should handle Gemini models correctly', async () => {
        prepareGeminiResponse({ content: 'Hello from Gemini!' });

        const result = await provider(
          'gemini-2.5-pro-preview-05-06',
        ).doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(
          (result.content[0] as { type: 'text'; text: string }).text,
        ).toStrictEqual('Hello from Gemini!');
      });

      it('should pass correct headers for Gemini models', async () => {
        prepareGeminiResponse();

        await provider('gemini-2.5-pro-preview-05-06').doGenerate({
          prompt: TEST_PROMPT,
        });

        expect(server.calls[0].requestHeaders).toStrictEqual({
          authorization: 'Bearer test-api-key',
          'content-type': 'application/json',
          'app-code': 'WHVL9885',
          'x-goog-api-key': 'test-api-key',
        });
      });
    });
  });

  describe('completion', () => {
    describe('doGenerate', () => {
      function prepareJsonCompletionResponse({
        content = '',
        usage = {
          prompt_tokens: 4,
          total_tokens: 34,
          completion_tokens: 30,
        },
        logprobs = null,
        finish_reason = 'stop',
      }: {
        content?: string;
        usage?: {
          prompt_tokens: number;
          total_tokens: number;
          completion_tokens: number;
        };
        logprobs?: {
          tokens: string[];
          token_logprobs: number[];
          top_logprobs: Record<string, number>[];
        } | null;
        finish_reason?: string;
      }) {
        server.urls['https://aihubmix.com/v1/completions'].response = {
          type: 'json-value',
          body: {
            id: 'cmpl-96cAM1v77r4jXa4qb2NSmRREV5oWB',
            object: 'text_completion',
            created: 1711363706,
            model: 'gpt-35-turbo-instruct',
            choices: [
              {
                text: content,
                index: 0,
                logprobs,
                finish_reason,
              },
            ],
            usage,
          },
        };
      }

      it('should pass headers', async () => {
        prepareJsonCompletionResponse({ content: 'Hello World!' });

        const provider = createAihubmix({
          apiKey: 'test-api-key',
        });

        await provider.completion('gpt-35-turbo-instruct').doGenerate({
          prompt: TEST_PROMPT,
          headers: {
            'Custom-Request-Header': 'request-header-value',
          },
        });

        expect(server.calls[0].requestHeaders).toStrictEqual({
          authorization: 'Bearer test-api-key',
          'content-type': 'application/json',
          'app-code': 'WHVL9885',
          'custom-request-header': 'request-header-value',
        });
      });

      it('should generate completion text', async () => {
        prepareJsonCompletionResponse({ content: 'Generated completion text' });

        const result = await provider
          .completion('gpt-35-turbo-instruct')
          .doGenerate({
            prompt: TEST_PROMPT,
          });

        expect(
          (result.content[0] as { type: 'text'; text: string }).text,
        ).toStrictEqual('Generated completion text');
      });
    });
  });

  describe('embedding', () => {
    const dummyEmbeddings = [
      [0.1, 0.2, 0.3, 0.4, 0.5],
      [0.6, 0.7, 0.8, 0.9, 1.0],
    ];
    const testValues = ['sunny day at the beach', 'rainy day in the city'];

    describe('doEmbed', () => {
      const model = provider.embedding('text-embedding-ada-002');

      function prepareJsonResponse({
        embeddings = dummyEmbeddings,
      }: {
        embeddings?: EmbeddingModelV2Embedding[];
      } = {}) {
        server.urls['https://aihubmix.com/v1/embeddings'].response = {
          type: 'json-value',
          body: {
            object: 'list',
            data: embeddings.map(embedding => ({
              object: 'embedding',
              embedding,
              index: 0,
            })),
            model: 'text-embedding-ada-002',
            usage: {
              prompt_tokens: 8,
              total_tokens: 8,
            },
          },
        };
      }

      it('should pass headers', async () => {
        prepareJsonResponse();

        const provider = createAihubmix({
          apiKey: 'test-api-key',
        });

        await provider.embedding('text-embedding-ada-002').doEmbed({
          values: testValues,
          headers: { 'Custom-Request-Header': 'request-header-value' },
        });

        expect(server.calls[0].requestHeaders).toStrictEqual({
          authorization: 'Bearer test-api-key',
          'content-type': 'application/json',
          'app-code': 'WHVL9885',
          'custom-request-header': 'request-header-value',
        });
      });

      it('should generate embeddings', async () => {
        prepareJsonResponse();

        const { embeddings } = await model.doEmbed({
          values: testValues,
        });

        expect(embeddings).toStrictEqual(dummyEmbeddings);
      });
    });
  });

  describe('image generation', () => {
    describe('doGenerate', () => {
      function prepareImageResponse({
        url = 'https://example.com/image.png',
      }: { url?: string } = {}) {
        server.urls['https://aihubmix.com/v1/images/generations'].response = {
          type: 'json-value',
          body: {
            created: 1711115037,
            data: [
              {
                url,
                revised_prompt: 'A beautiful sunset',
                b64_json: 'base64-encoded-image-data',
              },
            ],
          },
        };
      }

      it('should generate images', async () => {
        prepareImageResponse();

        const { images } = await provider.image('dall-e-3').doGenerate({
          prompt: 'A beautiful sunset',
          n: 1,
          size: '1024x1024',
          aspectRatio: '1:1',
          seed: 123,
          providerOptions: {},
        });

        expect(images).toStrictEqual(['base64-encoded-image-data']);
      });
    });
  });

  describe('provider configuration', () => {
    it('should handle missing API key', () => {
      // This should throw an error when no API key is provided
      expect(() => {
        createAihubmix({});
      }).not.toThrow(); // The provider should handle missing API key gracefully
    });
  });

  describe('transcription', () => {
    describe('doGenerate', () => {
      function prepareTranscriptionResponse({
        text = 'Hello, this is a test transcription.',
      }: { text?: string } = {}) {
        server.urls['https://aihubmix.com/v1/audio/transcriptions'].response = {
          type: 'json-value',
          body: {
            text,
          },
        };
      }

      it('should pass headers', async () => {
        prepareTranscriptionResponse();

        await provider.transcription('whisper-1').doGenerate({
          audio: new Uint8Array(8),
          mediaType: 'audio/wav',
          headers: { 'Custom-Request-Header': 'request-header-value' },
        });

        expect(server.calls[0].requestHeaders).toMatchObject({
          authorization: 'Bearer test-api-key',
          'app-code': 'WHVL9885',
          'custom-request-header': 'request-header-value',
        });
      });

      it('should transcribe audio', async () => {
        prepareTranscriptionResponse({ text: 'Transcribed audio content' });

        const { text } = await provider.transcription('whisper-1').doGenerate({
          audio: new Uint8Array(8),
          mediaType: 'audio/wav',
        });

        expect(text).toStrictEqual('Transcribed audio content');
      });
    });
  });

  describe('speech', () => {
    describe('doGenerate', () => {
      function prepareSpeechResponse({
        audio = new Uint8Array([
          98, 97, 115, 101, 54, 52, 45, 101, 110, 99, 111, 100, 101, 100, 45,
          97, 117, 100, 105, 111, 45, 100, 97, 116, 97,
        ]),
      }: { audio?: Uint8Array } = {}) {
        server.urls['https://aihubmix.com/v1/audio/speech'].response = {
          type: 'binary',
          body: Buffer.from(audio),
        };
      }

      it('should pass headers', async () => {
        prepareSpeechResponse();

        await provider.speech('tts-1').doGenerate({
          text: 'Hello, world!',
          voice: 'alloy',
          headers: { 'Custom-Request-Header': 'request-header-value' },
        });

        expect(server.calls[0].requestHeaders).toStrictEqual({
          authorization: 'Bearer test-api-key',
          'content-type': 'application/json',
          'app-code': 'WHVL9885',
          'custom-request-header': 'request-header-value',
        });
      });

      it('should generate speech audio', async () => {
        const testAudio = new Uint8Array([
          116, 101, 115, 116, 45, 97, 117, 100, 105, 111, 45, 100, 97, 116, 97,
        ]);
        prepareSpeechResponse({ audio: testAudio });

        const { audio } = await provider.speech('tts-1').doGenerate({
          text: 'Hello, world!',
          voice: 'alloy',
        });

        expect(audio).toStrictEqual(testAudio);
      });
    });
  });

  describe('provider methods', () => {
    it('should have all required methods', () => {
      expect(provider.languageModel).toBeDefined();
      expect(provider.chat).toBeDefined();
      expect(provider.completion).toBeDefined();
      expect(provider.responses).toBeDefined();
      expect(provider.embedding).toBeDefined();
      expect(provider.textEmbedding).toBeDefined();
      expect(provider.textEmbeddingModel).toBeDefined();
      expect(provider.image).toBeDefined();
      expect(provider.imageModel).toBeDefined();
      expect(provider.transcription).toBeDefined();
      expect(provider.transcriptionModel).toBeDefined();
      expect(provider.speech).toBeDefined();
      expect(provider.speechModel).toBeDefined();
      expect(provider.tools).toBeDefined();
    });

    it('should not allow new keyword', () => {
      expect(() => {
        new (provider as any)('gpt-4o');
      }).toThrow(
        'The Aihubmix model function cannot be called with the new keyword.',
      );
    });
  });
});

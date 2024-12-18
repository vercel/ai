import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  TestServerResponse,
  convertReadableStreamToArray,
  withTestServer,
} from '@ai-sdk/provider-utils/test';
import { createGoogleGenerativeAI } from './google-provider';
import {
  GoogleGenerativeAILanguageModel,
  groundingMetadataSchema,
} from './google-generative-ai-language-model';
import { GoogleGenerativeAIGroundingMetadata } from './google-generative-ai-prompt';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const SAFETY_RATINGS = [
  {
    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
    probability: 'NEGLIGIBLE',
  },
  {
    category: 'HARM_CATEGORY_HATE_SPEECH',
    probability: 'NEGLIGIBLE',
  },
  {
    category: 'HARM_CATEGORY_HARASSMENT',
    probability: 'NEGLIGIBLE',
  },
  {
    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
    probability: 'NEGLIGIBLE',
  },
];

const provider = createGoogleGenerativeAI({
  apiKey: 'test-api-key',
  generateId: () => 'test-id',
});
const model = provider.chat('gemini-pro');

describe('supportsUrl', () => {
  it('should return false if it is not a Gemini files URL', () => {
    expect(
      model.supportsUrl?.(new URL('https://example.com/foo/bar')),
    ).toStrictEqual(false);
  });

  it('should return true if it is a Gemini files URL', () => {
    expect(
      model.supportsUrl?.(
        new URL(
          'https://generativelanguage.googleapis.com/v1beta/files/00000000-00000000-00000000-00000000',
        ),
      ),
    ).toStrictEqual(true);
  });
});

describe('groundingMetadataSchema', () => {
  it('validates complete grounding metadata with web search results', () => {
    const metadata = {
      webSearchQueries: ["What's the weather in Chicago this weekend?"],
      searchEntryPoint: {
        renderedContent: 'Sample rendered content for search results',
      },
      groundingChunks: [
        {
          web: {
            uri: 'https://example.com/weather',
            title: 'Chicago Weather Forecast',
          },
        },
      ],
      groundingSupports: [
        {
          segment: {
            startIndex: 0,
            endIndex: 65,
            text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
          },
          groundingChunkIndices: [0],
          confidenceScores: [0.99],
        },
      ],
      retrievalMetadata: {
        webDynamicRetrievalScore: 0.96879,
      },
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates complete grounding metadata with Vertex AI Search results', () => {
    const metadata = {
      retrievalQueries: ['How to make appointment to renew driving license?'],
      groundingChunks: [
        {
          retrievedContext: {
            uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AXiHM.....QTN92V5ePQ==',
            title: 'dmv',
          },
        },
      ],
      groundingSupports: [
        {
          segment: {
            startIndex: 25,
            endIndex: 147,
          },
          segment_text: 'ipsum lorem ...',
          supportChunkIndices: [1, 2],
          confidenceScore: [0.9541752, 0.97726375],
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates partial grounding metadata', () => {
    const metadata = {
      webSearchQueries: ['sample query'],
      // Missing other optional fields
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates empty grounding metadata', () => {
    const metadata = {};

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('validates metadata with empty retrievalMetadata', () => {
    const metadata = {
      webSearchQueries: ['sample query'],
      retrievalMetadata: {},
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(true);
  });

  it('rejects invalid data types', () => {
    const metadata = {
      webSearchQueries: 'not an array', // Should be an array
      groundingSupports: [
        {
          confidenceScores: 'not an array', // Should be an array of numbers
        },
      ],
    };

    const result = groundingMetadataSchema.safeParse(metadata);
    expect(result.success).toBe(false);
  });
});

describe('doGenerate', () => {
  const prepareJsonResponse = ({
    content = '',
    usage = {
      promptTokenCount: 1,
      candidatesTokenCount: 2,
      totalTokenCount: 3,
    },
    headers,
    groundingMetadata,
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
  }: {
    content?: string;
    usage?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
    headers?: Record<string, string>;
    groundingMetadata?: GoogleGenerativeAIGroundingMetadata;
    url?: string;
  }): TestServerResponse => ({
    url,
    type: 'json-value',
    content: {
      candidates: [
        {
          content: {
            parts: [{ text: content }],
            role: 'model',
          },
          finishReason: 'STOP',
          index: 0,
          safetyRatings: SAFETY_RATINGS,
          ...(groundingMetadata && { groundingMetadata }),
        },
      ],
      promptFeedback: { safetyRatings: SAFETY_RATINGS },
      usageMetadata: usage,
    },
    headers,
  });

  it(
    'should extract text response',
    withTestServer(
      prepareJsonResponse({ content: 'Hello, World!' }),
      async () => {
        const { text } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(text).toStrictEqual('Hello, World!');
      },
    ),
  );

  it(
    'should extract usage',
    withTestServer(
      prepareJsonResponse({
        usage: {
          promptTokenCount: 20,
          candidatesTokenCount: 5,
          totalTokenCount: 25,
        },
      }),
      async () => {
        const { usage } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(usage).toStrictEqual({
          promptTokens: 20,
          completionTokens: 5,
        });
      },
    ),
  );

  it(
    'should extract tool calls',
    withTestServer(
      {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        type: 'json-value',
        content: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'test-tool',
                      args: { value: 'example value' },
                    },
                  },
                ],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
        },
      },
      async () => {
        const { toolCalls, finishReason, text } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: {
            type: 'regular',
            tools: [
              {
                type: 'function',
                name: 'test-tool',
                parameters: {
                  type: 'object',
                  properties: { value: { type: 'string' } },
                  required: ['value'],
                  additionalProperties: false,
                  $schema: 'http://json-schema.org/draft-07/schema#',
                },
              },
            ],
          },
          prompt: TEST_PROMPT,
        });

        expect(toolCalls).toStrictEqual([
          {
            toolCallId: 'test-id',
            toolCallType: 'function',
            toolName: 'test-tool',
            args: '{"value":"example value"}',
          },
        ]);
        expect(text).toStrictEqual(undefined);
        expect(finishReason).toStrictEqual('tool-calls');
      },
    ),
  );

  it(
    'should expose the raw response headers',
    withTestServer(
      prepareJsonResponse({ headers: { 'test-header': 'test-value' } }),
      async () => {
        const { rawResponse } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(rawResponse?.headers).toStrictEqual({
          // default headers:
          'content-length': '804',
          'content-type': 'application/json',

          // custom header
          'test-header': 'test-value',
        });
      },
    ),
  );

  it(
    'should pass the model and the messages',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: [
          { role: 'system', content: 'test system instruction' },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
      });

      expect(await call(0).getRequestBodyJson()).toStrictEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
        systemInstruction: { parts: [{ text: 'test system instruction' }] },
        generationConfig: {},
      });
    }),
  );

  it(
    'should pass tools and toolChoice',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'regular',
          tools: [
            {
              type: 'function',
              name: 'test-tool',
              parameters: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
                additionalProperties: false,
                $schema: 'http://json-schema.org/draft-07/schema#',
              },
            },
          ],
          toolChoice: {
            type: 'tool',
            toolName: 'test-tool',
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(await call(0).getRequestBodyJson()).toStrictEqual({
        generationConfig: {},
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        tools: {
          functionDeclarations: [
            {
              name: 'test-tool',
              description: '',
              parameters: {
                type: 'object',
                properties: { value: { type: 'string' } },
                required: ['value'],
              },
            },
          ],
        },
        toolConfig: {
          functionCallingConfig: {
            mode: 'ANY',
            allowedFunctionNames: ['test-tool'],
          },
        },
      });
    }),
  );

  it(
    'should set response mime type in object-json mode',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await model.doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
          schema: {
            type: 'object',
            properties: { location: { type: 'string' } },
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(await call(0).getRequestBodyJson()).toStrictEqual({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'Hello' }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              location: {
                type: 'string',
              },
            },
          },
        },
      });
    }),
  );

  it(
    'should pass specification in object-json mode with structuredOutputs = true (default)',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await provider.languageModel('gemini-pro').doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-json',
          schema: {
            type: 'object',
            properties: {
              property1: { type: 'string' },
              property2: { type: 'number' },
            },
            required: ['property1', 'property2'],
            additionalProperties: false,
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(await call(0).getRequestBodyJson()).toStrictEqual({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            properties: {
              property1: { type: 'string' },
              property2: { type: 'number' },
            },
            required: ['property1', 'property2'],
            type: 'object',
          },
        },
      });
    }),
  );

  it(
    'should not pass specification in object-json mode with structuredOutputs = false',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await provider
        .languageModel('gemini-pro', {
          structuredOutputs: false,
        })
        .doGenerate({
          inputFormat: 'prompt',
          mode: {
            type: 'object-json',
            schema: {
              type: 'object',
              properties: {
                property1: { type: 'string' },
                property2: { type: 'number' },
              },
              required: ['property1', 'property2'],
              additionalProperties: false,
            },
          },
          prompt: TEST_PROMPT,
        });

      expect(await call(0).getRequestBodyJson()).toStrictEqual({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
    }),
  );

  it(
    'should pass tool specification in object-tool mode',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await provider.languageModel('gemini-pro').doGenerate({
        inputFormat: 'prompt',
        mode: {
          type: 'object-tool',
          tool: {
            name: 'test-tool',
            type: 'function',
            parameters: {
              type: 'object',
              properties: {
                property1: { type: 'string' },
                property2: { type: 'number' },
              },
              required: ['property1', 'property2'],
              additionalProperties: false,
            },
          },
        },
        prompt: TEST_PROMPT,
      });

      expect(await call(0).getRequestBodyJson()).toStrictEqual({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {},
        toolConfig: { functionCallingConfig: { mode: 'ANY' } },
        tools: {
          functionDeclarations: [
            {
              name: 'test-tool',
              description: '',
              parameters: {
                properties: {
                  property1: { type: 'string' },
                  property2: { type: 'number' },
                },
                required: ['property1', 'property2'],
                type: 'object',
              },
            },
          ],
        },
      });
    }),
  );

  it(
    'should pass headers',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      const provider = createGoogleGenerativeAI({
        apiKey: 'test-api-key',
        headers: {
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await provider.chat('gemini-pro').doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      const requestHeaders = call(0).getRequestHeaders();

      expect(requestHeaders).toStrictEqual({
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
        'x-goog-api-key': 'test-api-key',
      });
    }),
  );

  it(
    'should pass response format',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        responseFormat: {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
            },
            required: ['text'],
          },
        },
      });

      expect(await call(0).getRequestBodyJson()).toStrictEqual({
        contents: [{ role: 'user', parts: [{ text: 'Hello' }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              text: { type: 'string' },
            },
            required: ['text'],
          },
        },
      });
    }),
  );

  it(
    'should send request body',
    withTestServer(prepareJsonResponse({}), async () => {
      const { request } = await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(request).toStrictEqual({
        body: '{"generationConfig":{},"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}',
      });
    }),
  );

  describe('async headers handling', () => {
    it(
      'merges async config headers with sync request headers',
      withTestServer(prepareJsonResponse({}), async ({ call }) => {
        const model = new GoogleGenerativeAILanguageModel(
          'gemini-pro',
          {},
          {
            provider: 'google.generative-ai',
            baseURL: 'https://generativelanguage.googleapis.com/v1beta',
            headers: async () => ({
              'X-Async-Config': 'async-config-value',
              'X-Common': 'config-value',
            }),
            generateId: () => 'test-id',
          },
        );

        await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
          headers: {
            'X-Sync-Request': 'sync-request-value',
            'X-Common': 'request-value', // Should override config value
          },
        });

        const requestHeaders = call(0).getRequestHeaders();
        expect(requestHeaders).toStrictEqual({
          'content-type': 'application/json',
          'x-async-config': 'async-config-value',
          'x-sync-request': 'sync-request-value',
          'x-common': 'request-value', // Request headers take precedence
        });
      }),
    );

    it(
      'handles Promise-based headers',
      withTestServer(prepareJsonResponse({}), async ({ call }) => {
        const model = new GoogleGenerativeAILanguageModel(
          'gemini-pro',
          {},
          {
            provider: 'google.generative-ai',
            baseURL: 'https://generativelanguage.googleapis.com/v1beta',
            headers: Promise.resolve({
              'X-Promise-Header': 'promise-value',
            }),
            generateId: () => 'test-id',
          },
        );

        await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const requestHeaders = call(0).getRequestHeaders();
        expect(requestHeaders).toStrictEqual({
          'content-type': 'application/json',
          'x-promise-header': 'promise-value',
        });
      }),
    );

    it(
      'handles async function headers from config',
      withTestServer(prepareJsonResponse({}), async ({ call }) => {
        const model = new GoogleGenerativeAILanguageModel(
          'gemini-pro',
          {},
          {
            provider: 'google.generative-ai',
            baseURL: 'https://generativelanguage.googleapis.com/v1beta',
            headers: async () => ({
              'X-Async-Header': 'async-value',
            }),
            generateId: () => 'test-id',
          },
        );

        await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const requestHeaders = call(0).getRequestHeaders();
        expect(requestHeaders).toStrictEqual({
          'content-type': 'application/json',
          'x-async-header': 'async-value',
        });
      }),
    );
  });

  it(
    'should expose safety ratings in provider metadata',
    withTestServer(
      {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        type: 'json-value',
        content: {
          candidates: [
            {
              content: {
                parts: [{ text: 'test response' }],
                role: 'model',
              },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: [
                {
                  category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                  probability: 'NEGLIGIBLE',
                  probabilityScore: 0.1,
                  severity: 'LOW',
                  severityScore: 0.2,
                  blocked: false,
                },
              ],
            },
          ],
          promptFeedback: { safetyRatings: SAFETY_RATINGS },
        },
      },
      async () => {
        const { providerMetadata } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(providerMetadata?.google.safetyRatings).toStrictEqual([
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            probability: 'NEGLIGIBLE',
            probabilityScore: 0.1,
            severity: 'LOW',
            severityScore: 0.2,
            blocked: false,
          },
        ]);
      },
    ),
  );

  it(
    'should expose grounding metadata in provider metadata',
    withTestServer(
      prepareJsonResponse({
        content: 'test response',
        groundingMetadata: {
          webSearchQueries: ["What's the weather in Chicago this weekend?"],
          searchEntryPoint: {
            renderedContent: 'Sample rendered content for search results',
          },
          groundingChunks: [
            {
              web: {
                uri: 'https://example.com/weather',
                title: 'Chicago Weather Forecast',
              },
            },
          ],
          groundingSupports: [
            {
              segment: {
                startIndex: 0,
                endIndex: 65,
                text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
              },
              groundingChunkIndices: [0],
              confidenceScores: [0.99],
            },
          ],
          retrievalMetadata: {
            webDynamicRetrievalScore: 0.96879,
          },
        },
      }),
      async () => {
        const { providerMetadata } = await model.doGenerate({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(providerMetadata?.google.groundingMetadata).toStrictEqual({
          webSearchQueries: ["What's the weather in Chicago this weekend?"],
          searchEntryPoint: {
            renderedContent: 'Sample rendered content for search results',
          },
          groundingChunks: [
            {
              web: {
                uri: 'https://example.com/weather',
                title: 'Chicago Weather Forecast',
              },
            },
          ],
          groundingSupports: [
            {
              segment: {
                startIndex: 0,
                endIndex: 65,
                text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
              },
              groundingChunkIndices: [0],
              confidenceScores: [0.99],
            },
          ],
          retrievalMetadata: {
            webDynamicRetrievalScore: 0.96879,
          },
        });
      },
    ),
  );
  describe('search tool selection', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
    });

    it(
      'should use googleSearch for gemini-2.0-pro',
      withTestServer(
        prepareJsonResponse({
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:generateContent',
        }),
        async ({ call }) => {
          const gemini2Pro = provider.languageModel('gemini-2.0-pro', {
            useSearchGrounding: true,
          });
          await gemini2Pro.doGenerate({
            inputFormat: 'prompt',
            mode: { type: 'regular' },
            prompt: TEST_PROMPT,
          });

          expect(await call(0).getRequestBodyJson()).toMatchObject({
            tools: { googleSearch: {} },
          });
        },
      ),
    );

    it(
      'should use googleSearch for gemini-2.0-flash-exp',
      withTestServer(
        prepareJsonResponse({
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent',
        }),
        async ({ call }) => {
          const gemini2Flash = provider.languageModel('gemini-2.0-flash-exp', {
            useSearchGrounding: true,
          });
          await gemini2Flash.doGenerate({
            inputFormat: 'prompt',
            mode: { type: 'regular' },
            prompt: TEST_PROMPT,
          });

          expect(await call(0).getRequestBodyJson()).toMatchObject({
            tools: { googleSearch: {} },
          });
        },
      ),
    );

    it(
      'should use googleSearchRetrieval for non-gemini-2 models',
      withTestServer(
        prepareJsonResponse({
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:generateContent',
        }),
        async ({ call }) => {
          const geminiPro = provider.languageModel('gemini-1.0-pro', {
            useSearchGrounding: true,
          });
          await geminiPro.doGenerate({
            inputFormat: 'prompt',
            mode: { type: 'regular' },
            prompt: TEST_PROMPT,
          });

          expect(await call(0).getRequestBodyJson()).toMatchObject({
            tools: { googleSearchRetrieval: {} },
          });
        },
      ),
    );
  });
});

describe('doStream', () => {
  const prepareStreamResponse = ({
    content,
    headers,
    groundingMetadata,
    url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
  }: {
    content: string[];
    headers?: Record<string, string>;
    groundingMetadata?: GoogleGenerativeAIGroundingMetadata;
    url?: string;
  }): TestServerResponse => ({
    url,
    type: 'stream-values',
    content: content.map(
      (text, index) =>
        `data: ${JSON.stringify({
          candidates: [
            {
              content: { parts: [{ text }], role: 'model' },
              finishReason: 'STOP',
              index: 0,
              safetyRatings: SAFETY_RATINGS,
              ...(groundingMetadata && { groundingMetadata }),
            },
          ],
          // Include usage metadata only in the last chunk
          ...(index === content.length - 1 && {
            usageMetadata: {
              promptTokenCount: 294,
              candidatesTokenCount: 233,
              totalTokenCount: 527,
            },
          }),
        })}\n\n`,
    ),
    headers,
  });

  it(
    'should expose grounding metadata in provider metadata on finish',
    withTestServer(
      prepareStreamResponse({
        content: ['test'],
        groundingMetadata: {
          webSearchQueries: ["What's the weather in Chicago this weekend?"],
          searchEntryPoint: {
            renderedContent: 'Sample rendered content for search results',
          },
          groundingChunks: [
            {
              web: {
                uri: 'https://example.com/weather',
                title: 'Chicago Weather Forecast',
              },
            },
          ],
          groundingSupports: [
            {
              segment: {
                startIndex: 0,
                endIndex: 65,
                text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
              },
              groundingChunkIndices: [0],
              confidenceScores: [0.99],
            },
          ],
          retrievalMetadata: {
            webDynamicRetrievalScore: 0.96879,
          },
        },
      }),
      async () => {
        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);
        const finishEvent = events.find(event => event.type === 'finish');

        expect(
          finishEvent?.type === 'finish' &&
            finishEvent.providerMetadata?.google.groundingMetadata,
        ).toStrictEqual({
          webSearchQueries: ["What's the weather in Chicago this weekend?"],
          searchEntryPoint: {
            renderedContent: 'Sample rendered content for search results',
          },
          groundingChunks: [
            {
              web: {
                uri: 'https://example.com/weather',
                title: 'Chicago Weather Forecast',
              },
            },
          ],
          groundingSupports: [
            {
              segment: {
                startIndex: 0,
                endIndex: 65,
                text: 'Chicago weather changes rapidly, so layers let you adjust easily.',
              },
              groundingChunkIndices: [0],
              confidenceScores: [0.99],
            },
          ],
          retrievalMetadata: {
            webDynamicRetrievalScore: 0.96879,
          },
        });
      },
    ),
  );

  it(
    'should stream text deltas',
    withTestServer(
      prepareStreamResponse({ content: ['Hello', ', ', 'world!'] }),
      async () => {
        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(await convertReadableStreamToArray(stream)).toStrictEqual([
          { type: 'text-delta', textDelta: 'Hello' },
          { type: 'text-delta', textDelta: ', ' },
          { type: 'text-delta', textDelta: 'world!' },
          {
            type: 'finish',
            finishReason: 'stop',
            providerMetadata: {
              google: {
                groundingMetadata: null,
                safetyRatings: [
                  {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    probability: 'NEGLIGIBLE',
                  },
                  {
                    category: 'HARM_CATEGORY_HATE_SPEECH',
                    probability: 'NEGLIGIBLE',
                  },
                  {
                    category: 'HARM_CATEGORY_HARASSMENT',
                    probability: 'NEGLIGIBLE',
                  },
                  {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    probability: 'NEGLIGIBLE',
                  },
                ],
              },
            },
            usage: { promptTokens: 294, completionTokens: 233 },
          },
        ]);
      },
    ),
  );

  it(
    'should expose the raw response headers',
    withTestServer(
      prepareStreamResponse({
        content: [],
        headers: { 'test-header': 'test-value' },
      }),
      async () => {
        const { rawResponse } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(rawResponse?.headers).toStrictEqual({
          // default headers:
          'content-type': 'text/event-stream',
          'cache-control': 'no-cache',
          connection: 'keep-alive',

          // custom header
          'test-header': 'test-value',
        });
      },
    ),
  );

  it(
    'should pass the messages',
    withTestServer(
      prepareStreamResponse({ content: [''] }),
      async ({ call }) => {
        await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(await call(0).getRequestBodyJson()).toStrictEqual({
          contents: [
            {
              role: 'user',
              parts: [{ text: 'Hello' }],
            },
          ],
          generationConfig: {},
        });
      },
    ),
  );

  it(
    'should set streaming mode search param',
    withTestServer(
      prepareStreamResponse({ content: [''] }),
      async ({ call }) => {
        await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const searchParams = call(0).getRequestUrlSearchParams();
        expect(searchParams.get('alt')).toStrictEqual('sse');
      },
    ),
  );

  it(
    'should pass headers',
    withTestServer(
      prepareStreamResponse({ content: [''] }),
      async ({ call }) => {
        const provider = createGoogleGenerativeAI({
          apiKey: 'test-api-key',
          headers: {
            'Custom-Provider-Header': 'provider-header-value',
          },
        });

        await provider.chat('gemini-pro').doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
          headers: {
            'Custom-Request-Header': 'request-header-value',
          },
        });

        const requestHeaders = call(0).getRequestHeaders();

        expect(requestHeaders).toStrictEqual({
          'content-type': 'application/json',
          'custom-provider-header': 'provider-header-value',
          'custom-request-header': 'request-header-value',
          'x-goog-api-key': 'test-api-key',
        });
      },
    ),
  );

  it(
    'should send request body',
    withTestServer(prepareStreamResponse({ content: [''] }), async () => {
      const { request } = await model.doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
      });

      expect(request).toStrictEqual({
        body: '{"generationConfig":{},"contents":[{"role":"user","parts":[{"text":"Hello"}]}]}',
      });
    }),
  );

  it(
    'should support empty candidates array',
    withTestServer(
      {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
        type: 'stream-values',
        content: [
          `data: {"candidates": [{"content": {"parts": [{"text": "test"}],"role": "model"},` +
            `"finishReason": "STOP","index": 0,"safetyRatings": [` +
            `{"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT","probability": "NEGLIGIBLE"},` +
            `{"category": "HARM_CATEGORY_HATE_SPEECH","probability": "NEGLIGIBLE"},` +
            `{"category": "HARM_CATEGORY_HARASSMENT","probability": "NEGLIGIBLE"},` +
            `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE"}]}]}\n\n`,
          `data: {"usageMetadata": {"promptTokenCount": 294,"candidatesTokenCount": 233,"totalTokenCount": 527}}\n\n`,
        ],
      },
      async () => {
        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        expect(await convertReadableStreamToArray(stream)).toStrictEqual([
          { type: 'text-delta', textDelta: 'test' },
          {
            type: 'finish',
            finishReason: 'stop',
            providerMetadata: {
              google: {
                groundingMetadata: null,
                safetyRatings: [
                  {
                    category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
                    probability: 'NEGLIGIBLE',
                  },
                  {
                    category: 'HARM_CATEGORY_HATE_SPEECH',
                    probability: 'NEGLIGIBLE',
                  },
                  {
                    category: 'HARM_CATEGORY_HARASSMENT',
                    probability: 'NEGLIGIBLE',
                  },
                  {
                    category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                    probability: 'NEGLIGIBLE',
                  },
                ],
              },
            },
            usage: { promptTokens: 294, completionTokens: 233 },
          },
        ]);
      },
    ),
  );

  it(
    'should expose safety ratings in provider metadata on finish',
    withTestServer(
      {
        url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
        type: 'stream-values',
        content: [
          `data: {"candidates": [{"content": {"parts": [{"text": "test"}],"role": "model"},` +
            `"finishReason": "STOP","index": 0,"safetyRatings": [` +
            `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE",` +
            `"probabilityScore": 0.1,"severity": "LOW","severityScore": 0.2,"blocked": false}]}]}\n\n`,
        ],
      },
      async () => {
        const { stream } = await model.doStream({
          inputFormat: 'prompt',
          mode: { type: 'regular' },
          prompt: TEST_PROMPT,
        });

        const events = await convertReadableStreamToArray(stream);
        const finishEvent = events.find(event => event.type === 'finish');

        expect(
          finishEvent?.type === 'finish' &&
            finishEvent.providerMetadata?.google.safetyRatings,
        ).toStrictEqual([
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            probability: 'NEGLIGIBLE',
            probabilityScore: 0.1,
            severity: 'LOW',
            severityScore: 0.2,
            blocked: false,
          },
        ]);
      },
    ),
  );
  describe('search tool selection', () => {
    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      generateId: () => 'test-id',
    });

    it(
      'should use googleSearch for gemini-2.0-pro',
      withTestServer(
        prepareStreamResponse({
          content: [''],
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-pro:streamGenerateContent',
        }),
        async ({ call }) => {
          const gemini2Pro = provider.languageModel('gemini-2.0-pro', {
            useSearchGrounding: true,
          });
          await gemini2Pro.doStream({
            inputFormat: 'prompt',
            mode: { type: 'regular' },
            prompt: TEST_PROMPT,
          });

          expect(await call(0).getRequestBodyJson()).toMatchObject({
            tools: { googleSearch: {} },
          });
        },
      ),
    );

    it(
      'should use googleSearch for gemini-2.0-flash-exp',
      withTestServer(
        prepareStreamResponse({
          content: [''],
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:streamGenerateContent',
        }),
        async ({ call }) => {
          const gemini2Flash = provider.languageModel('gemini-2.0-flash-exp', {
            useSearchGrounding: true,
          });
          await gemini2Flash.doStream({
            inputFormat: 'prompt',
            mode: { type: 'regular' },
            prompt: TEST_PROMPT,
          });

          expect(await call(0).getRequestBodyJson()).toMatchObject({
            tools: { googleSearch: {} },
          });
        },
      ),
    );

    it(
      'should use googleSearchRetrieval for non-gemini-2 models',
      withTestServer(
        prepareStreamResponse({
          content: [''],
          url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.0-pro:streamGenerateContent',
        }),
        async ({ call }) => {
          const geminiPro = provider.languageModel('gemini-1.0-pro', {
            useSearchGrounding: true,
          });
          await geminiPro.doStream({
            inputFormat: 'prompt',
            mode: { type: 'regular' },
            prompt: TEST_PROMPT,
          });

          expect(await call(0).getRequestBodyJson()).toMatchObject({
            tools: { googleSearchRetrieval: {} },
          });
        },
      ),
    );
  });
});

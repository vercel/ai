import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  TestServerResponse,
  convertReadableStreamToArray,
  withTestServer,
} from '@ai-sdk/provider-utils/test';
import { createGoogleGenerativeAI } from './google-provider';

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
const model = provider.chat('models/gemini-pro');

describe('doGenerate', () => {
  const prepareJsonResponse = ({
    content = '',
    usage = {
      promptTokenCount: 1,
      candidatesTokenCount: 2,
      totalTokenCount: 3,
    },
    headers,
  }: {
    content?: string;
    usage?: {
      promptTokenCount: number;
      candidatesTokenCount: number;
      totalTokenCount: number;
    };
    headers?: Record<string, string>;
  }): TestServerResponse => ({
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
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
    'should set response mime type for json mode',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await model.doGenerate({
        inputFormat: 'prompt',
        mode: { type: 'object-json' },
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
          response_mime_type: 'application/json',
        },
      });
    }),
  );

  it(
    'should pass tool specification in object-tool mode',
    withTestServer(prepareJsonResponse({}), async ({ call }) => {
      await provider.languageModel('models/gemini-pro').doGenerate({
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

      await provider.chat('models/gemini-pro').doGenerate({
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
});

describe('doStream', () => {
  const prepareStreamResponse = ({
    content,
    headers,
  }: {
    content: string[];
    headers?: Record<string, string>;
  }): TestServerResponse => ({
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent',
    type: 'stream-values',
    content: content.map(
      text =>
        `data: {"candidates": [{"content": {"parts": [{"text": "${text}"}],"role": "model"},` +
        `"finishReason": "STOP","index": 0,"safetyRatings": [` +
        `{"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT","probability": "NEGLIGIBLE"},` +
        `{"category": "HARM_CATEGORY_HATE_SPEECH","probability": "NEGLIGIBLE"},` +
        `{"category": "HARM_CATEGORY_HARASSMENT","probability": "NEGLIGIBLE"},` +
        `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE"}]}],` +
        `"usageMetadata": {"promptTokenCount": 294,"candidatesTokenCount": 233,"totalTokenCount": 527}}\n\n`,
    ),
    headers,
  });

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

        await provider.chat('models/gemini-pro').doStream({
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
});

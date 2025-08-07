import type { LanguageModelV2Prompt } from '@ai-sdk/provider';
import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createVertex } from './google-vertex-provider';

const TEST_PROMPT: LanguageModelV2Prompt = [
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

const TEST_BASE_URL =
  'https://vertex.googleapis.com/v1/projects/test-project/locations/global/publishers/google';

const MODEL_ID = 'gemini-2.5-flash';

const vertexProvider = createVertex({
  project: 'test-project',
  location: 'global',
  baseURL: TEST_BASE_URL,
  generateId: () => 'test-id',
});
const model = vertexProvider.languageModel(MODEL_ID);

describe('doGenerate', () => {
  const TEST_URL = `${TEST_BASE_URL}/models/${MODEL_ID}:generateContent`;

  const server = createTestServer({
    [TEST_URL]: {},
  });

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
  }) => {
    server.urls[TEST_URL].response = {
      type: 'json-value',
      headers,
      body: {
        candidates: [
          {
            content: {
              parts: content.length > 0 ? [{ text: content }] : [],
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
    };
  };

  it('should pass responseModalities from providerOptions.vertex', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        vertex: {
          responseModalities: ['TEXT', 'IMAGE'],
          foo: 'bar',
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;

    expect(requestBody).toMatchObject({
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
  });

  it('should omit responseSchema when structuredOutputs is false', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      prompt: TEST_PROMPT,
      responseFormat: {
        type: 'json',
        schema: {
          type: 'object',
          properties: { location: { type: 'string' } },
        },
      },
      providerOptions: {
        vertex: {
          structuredOutputs: false,
        },
      },
    });

    const requestBody = await server.calls[0].requestBodyJson;

    expect(requestBody).toMatchObject({
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });
    expect(requestBody.generationConfig).not.toHaveProperty('responseSchema');
  });

  it('should pass thinkingConfig and produce no warnings', async () => {
    prepareJsonResponse({});

    const { warnings } = await model.doGenerate({
      prompt: TEST_PROMPT,
      providerOptions: {
        vertex: {
          thinkingConfig: {
            includeThoughts: true,
            thinkingBudget: 500,
          },
        },
      },
    });

    expect(warnings).toHaveLength(0);

    const requestBody = await server.calls[0].requestBodyJson;

    expect(requestBody).toMatchObject({
      generationConfig: {
        thinkingConfig: {
          includeThoughts: true,
          thinkingBudget: 500,
        },
      },
    });
  });
});

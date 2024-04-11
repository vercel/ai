import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { Google } from './google-facade';

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

const google = new Google({
  apiKey: 'test-api-key',
  generateId: () => 'test-id',
});
const model = google.generativeAI('models/gemini-pro');

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({ content = '' }: { content?: string }) {
    server.responseBodyJson = {
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
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract tool calls', async () => {
    server.responseBodyJson = {
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
    };

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
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
      ],
      generationConfig: {},
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const google = new Google({ apiKey: 'test-api-key' });
    const model = google.generativeAI('models/gemini-pro');

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('x-goog-api-key'),
    ).toStrictEqual('test-api-key');
  });
});

describe('doStream', () => {
  const server = new StreamingTestServer(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:streamGenerateContent?alt=sse',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({ content }: { content: string[] }) {
    server.responseChunks = content.map(
      text =>
        `data: {"candidates": [{"content": {"parts": [{"text": "${text}"}],"role": "model"},` +
        `"finishReason": "STOP","index": 0,"safetyRatings": [` +
        `{"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT","probability": "NEGLIGIBLE"},` +
        `{"category": "HARM_CATEGORY_HATE_SPEECH","probability": "NEGLIGIBLE"},` +
        `{"category": "HARM_CATEGORY_HARASSMENT","probability": "NEGLIGIBLE"},` +
        `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE"}]}]}\n\n`,
    );
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'world!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: NaN, completionTokens: NaN },
      },
    ]);
  });

  it('should pass the messages', async () => {
    prepareStreamResponse({ content: [''] });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello' }],
        },
      ],
      generationConfig: {},
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [''] });

    const google = new Google({ apiKey: 'test-api-key' });

    await google.generativeAI('models/gemini-pro').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('x-goog-api-key'),
    ).toStrictEqual('test-api-key');
  });
});

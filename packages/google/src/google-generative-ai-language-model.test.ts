import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertStreamToArray,
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

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({ content: '' });

    server.responseHeaders = {
      'test-header': 'test-value',
    };

    const { rawResponse } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(rawResponse?.headers).toStrictEqual({
      // default headers:
      'content-type': 'application/json',

      // custom header
      'test-header': 'test-value',
    });
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

  it('should set response mime type for json mode', async () => {
    prepareJsonResponse({ content: '' });

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'object-json' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
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
  });

  it('should pass custom headers', async () => {
    prepareJsonResponse({ content: '' });

    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider.chat('models/gemini-pro').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const requestHeaders = await server.getRequestHeaders();
    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const provider = createGoogleGenerativeAI({ apiKey: 'test-api-key' });
    const model = provider.chat('models/gemini-pro');

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
        `{"category": "HARM_CATEGORY_DANGEROUS_CONTENT","probability": "NEGLIGIBLE"}]}],` +
        `"usageMetadata": {"promptTokenCount": 294,"candidatesTokenCount": 233,"totalTokenCount": 527}}\n\n`,
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
        usage: { promptTokens: 294, completionTokens: 233 },
      },
    ]);
  });

  it('should expose the raw response headers', async () => {
    prepareStreamResponse({ content: [] });

    server.responseHeaders = {
      'test-header': 'test-value',
    };

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

  it('should pass custom headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createGoogleGenerativeAI({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider.chat('models/gemini-pro').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const requestHeaders = await server.getRequestHeaders();
    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [''] });

    const provider = createGoogleGenerativeAI({ apiKey: 'test-api-key' });

    await provider.chat('models/gemini-pro').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('x-goog-api-key'),
    ).toStrictEqual('test-api-key');
  });
});

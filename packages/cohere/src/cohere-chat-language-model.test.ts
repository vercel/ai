import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import {
  JsonTestServer,
  StreamingTestServer,
  convertReadableStreamToArray,
} from '@ai-sdk/provider-utils/test';
import { createCohere } from './cohere-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const provider = createCohere({ apiKey: 'test-api-key' });
const model = provider('command-r-plus');

describe('doGenerate', () => {
  const server = new JsonTestServer('https://api.cohere.com/v1/chat');

  server.setupTestEnvironment();

  function prepareJsonResponse({
    input = '',
    text = '',
    finish_reason = 'COMPLETE',
    tokens = {
      input_tokens: 4,
      output_tokens: 30,
    },
  }: {
    input?: string;
    text?: string;
    finish_reason?: string;
    tokens?: {
      input_tokens: number;
      output_tokens: number;
    };
  }) {
    server.responseBodyJson = {
      response_id: '0cf61ae0-1f60-4c18-9802-be7be809e712',
      text,
      generation_id: 'dad0c7cd-7982-42a7-acfb-706ccf598291',
      chat_history: [
        { role: 'USER', message: input },
        { role: 'CHATBOT', message: text },
      ],
      finish_reason,
      meta: {
        api_version: { version: '1' },
        billed_units: { input_tokens: 9, output_tokens: 415 },
        tokens,
      },
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ text: 'Hello, World!' });

    const { text } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      tokens: { input_tokens: 20, output_tokens: 5 },
    });

    const { usage } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: 5,
    });
  });

  it('should extract finish reason', async () => {
    prepareJsonResponse({
      finish_reason: 'MAX_TOKENS',
    });

    const { finishReason } = await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(finishReason).toStrictEqual('length');
  });

  it('should expose the raw response headers', async () => {
    prepareJsonResponse({});

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

  it('should pass model, message, and chat history', async () => {
    prepareJsonResponse({});

    await model.doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'command-r-plus',
      message: 'Hello',
      chat_history: [],
    });
  });

  it('should pass custom headers', async () => {
    prepareJsonResponse({});

    const provider = createCohere({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider('command-r-plus').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const requestHeaders = await server.getRequestHeaders();
    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({});

    const provider = createCohere({ apiKey: 'test-api-key' });

    await provider('command-r-plus').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});

describe('doStream', () => {
  const server = new StreamingTestServer('https://api.cohere.com/v1/chat');

  server.setupTestEnvironment();

  function prepareStreamResponse({
    content,
    usage = {
      input_tokens: 17,
      output_tokens: 244,
    },
    finish_reason = 'COMPLETE',
  }: {
    content: string[];
    usage?: {
      input_tokens: number;
      output_tokens: number;
    };
    finish_reason?: string;
  }) {
    server.responseChunks = [
      `{"is_finished":false,"event_type":"stream-start","generation_id":"586ac33f-9c64-452c-8f8d-e5890e73b6fb"}\n`,
      ...content.map(
        text =>
          `{"is_finished":false,"event_type":"text-generation","text":"${text}"}\n`,
      ),
      `{"is_finished":true,"event_type":"stream-end","response":` +
        `{"response_id":"ac6d5f86-f5a7-4db9-bacf-f01b98697a5b",` +
        `"text":"${content.join('')}",` +
        `"generation_id":"586ac33f-9c64-452c-8f8d-e5890e73b6fb",` +
        `"chat_history":[{"role":"USER","message":"Invent a new holiday and describe its traditions."},` +
        `{"role":"CHATBOT","message":"${content.join('')}"}],` +
        `"finish_reason":"${finish_reason}","meta":{"api_version":{"version":"1"},` +
        `"billed_units":{"input_tokens":9,"output_tokens":20},` +
        `"tokens":${JSON.stringify(
          usage,
        )}}},"finish_reason":"${finish_reason}"}\n`,
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({
      content: ['Hello', ', ', 'World!'],
      finish_reason: 'COMPLETE',
      usage: {
        input_tokens: 34,
        output_tokens: 12,
      },
    });

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertReadableStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
      {
        type: 'finish',
        finishReason: 'stop',
        usage: { promptTokens: 34, completionTokens: 12 },
      },
    ]);
  });

  it('should handle unparsable stream parts', async () => {
    server.responseChunks = [`{unparsable}\n`];

    const { stream } = await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const elements = await convertReadableStreamToArray(stream);

    expect(elements.length).toBe(2);
    expect(elements[0].type).toBe('error');
    expect(elements[1]).toStrictEqual({
      finishReason: 'error',
      type: 'finish',
      usage: {
        completionTokens: NaN,
        promptTokens: NaN,
      },
    });
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

  it('should pass the messages and the model', async () => {
    prepareStreamResponse({ content: [] });

    await model.doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'command-r-plus',
      message: 'Hello',
      chat_history: [],
    });
  });

  it('should pass custom headers', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createCohere({
      apiKey: 'test-api-key',
      headers: {
        'Custom-Header': 'test-header',
      },
    });

    await provider('command-r-plus').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders.get('Custom-Header')).toStrictEqual('test-header');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [] });

    const provider = createCohere({ apiKey: 'test-api-key' });

    await provider('command-r-plus').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});

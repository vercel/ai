import { LanguageModelV1Prompt } from '../ai-model-specification';
import { convertStreamToArray } from '../ai-model-specification/test/convert-stream-to-array';
import { JsonTestServer } from '../ai-model-specification/test/json-test-server';
import { StreamingTestServer } from '../ai-model-specification/test/streaming-test-server';
import { OpenAI } from './openai-facade';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const openai = new OpenAI({
  apiKey: 'test-api-key',
});

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({ content = '' }: { content?: string }) {
    server.responseBodyJson = {
      id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
      object: 'chat.completion',
      created: 1711115037,
      model: 'gpt-3.5-turbo-0125',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          logprobs: null,
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 9,
        total_tokens: 17,
      },
      system_fingerprint: 'fp_3bc1b5746c',
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await openai.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({ content: '' });

    await openai.chat('gpt-3.5-turbo').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const openai = new OpenAI({ apiKey: 'test-api-key' });

    await openai.chat('gpt-3.5-turbo').doGenerate({
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
  const server = new StreamingTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({ content }: { content: string[] }) {
    server.responseChunks = [
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
      ...content.map(text => {
        return (
          `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
          `"system_fingerprint":null,"choices":[{"index":1,"delta":{"content":"${text}"},"finish_reason":null}]}\n\n`
        );
      }),
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
      'data: [DONE]\n\n',
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'World!'] });

    const { stream } = await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'World!' },
    ]);
  });

  it('should pass the messages', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
    });
  });

  it('should scale the temperature', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      temperature: 0.5,
    });

    expect((await server.getRequestBodyJson()).temperature).toBeCloseTo(1, 5);
  });

  it('should scale the frequency penalty', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      frequencyPenalty: 0.2,
    });

    expect((await server.getRequestBodyJson()).frequency_penalty).toBeCloseTo(
      0.4,
      5,
    );
  });

  it('should scale the presence penalty', async () => {
    prepareStreamResponse({ content: [] });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      presencePenalty: -0.9,
    });

    expect((await server.getRequestBodyJson()).presence_penalty).toBeCloseTo(
      -1.8,
      5,
    );
  });

  it('should pass the organization as OpenAI-Organization header', async () => {
    prepareStreamResponse({ content: [] });

    const openai = new OpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
    });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('OpenAI-Organization'),
    ).toStrictEqual('test-organization');
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [] });

    const openai = new OpenAI({ apiKey: 'test-api-key' });

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});

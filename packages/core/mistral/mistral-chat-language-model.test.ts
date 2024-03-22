import { LanguageModelV1Prompt } from '../ai-model-specification';
import { convertStreamToArray } from '../ai-model-specification/test/convert-stream-to-array';
import { JsonTestServer } from '../ai-model-specification/test/json-test-server';
import { StreamingTestServer } from '../ai-model-specification/test/streaming-test-server';
import { Mistral } from './mistral-facade';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const mistral = new Mistral({ apiKey: 'test-api-key' });

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.mistral.ai/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({
    content = '',
    usage = {
      prompt_tokens: 4,
      total_tokens: 34,
      completion_tokens: 30,
    },
  }: {
    content?: string;
    usage?: {
      prompt_tokens: number;
      total_tokens: number;
      completion_tokens: number;
    };
  }) {
    server.responseBodyJson = {
      id: '16362f24e60340d0994dd205c267a43a',
      object: 'chat.completion',
      created: 1711113008,
      model: 'mistral-small-latest',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
            tool_calls: null,
          },
          finish_reason: 'stop',
          logprobs: null,
        },
      ],
      usage,
    };
  }

  it('should extract text response', async () => {
    prepareJsonResponse({ content: 'Hello, World!' });

    const { text } = await mistral.chat('mistral-small-latest').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(text).toStrictEqual('Hello, World!');
  });

  it('should extract usage', async () => {
    prepareJsonResponse({
      content: '',
      usage: { prompt_tokens: 20, total_tokens: 25, completion_tokens: 5 },
    });

    const { usage } = await mistral.chat('mistral-small-latest').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(usage).toStrictEqual({
      promptTokens: 20,
      completionTokens: 5,
    });
  });

  it('should pass the model and the messages', async () => {
    prepareJsonResponse({ content: '' });

    await mistral.chat('mistral-small-latest').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse({ content: '' });

    const mistral = new Mistral({ apiKey: 'test-api-key' });

    await mistral.chat('mistral-small-latest').doGenerate({
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
    'https://api.mistral.ai/v1/chat/completions',
  );

  server.setupTestEnvironment();

  function prepareStreamResponse({ content }: { content: string[] }) {
    server.responseChunks = [
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"role":"assistant","content":""},"finish_reason":null,"logprobs":null}]}\n\n`,
      ...content.map(text => {
        return (
          `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
          `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
          `"delta":{"role":"assistant","content":"${text}"},"finish_reason":null,"logprobs":null}]}\n\n`
        );
      }),
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"content":""},"finish_reason":"stop","logprobs":null}],` +
        `"usage":{"prompt_tokens":4,"total_tokens":36,"completion_tokens":32}}\n\n`,
      `data: [DONE]\n\n`,
    ];
  }

  it('should stream text deltas', async () => {
    prepareStreamResponse({ content: ['Hello', ', ', 'world!'] });

    const { stream } = await mistral.chat('mistral-small-latest').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'world!' },
      { type: 'text-delta', textDelta: '' },
    ]);
  });

  it('should pass the messages', async () => {
    prepareStreamResponse({ content: [''] });

    await mistral.chat('mistral-small-latest').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    });
  });

  it('should pass the api key as Authorization header', async () => {
    prepareStreamResponse({ content: [''] });

    const mistral = new Mistral({ apiKey: 'test-api-key' });

    await mistral.chat('mistral-small-latest').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(
      (await server.getRequestHeaders()).get('Authorization'),
    ).toStrictEqual('Bearer test-api-key');
  });
});

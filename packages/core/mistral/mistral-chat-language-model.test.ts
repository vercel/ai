import { LanguageModelV1Prompt } from '../ai-model-specification';
import { Mistral } from './mistral-facade';
import { convertStreamToArray } from './test/convert-stream-to-array';
import { StreamingTestServer } from './test/streaming-test-server';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const mistral = new Mistral({ apiKey: 'test-api-key' });

describe('doStream', () => {
  const server = new StreamingTestServer(
    'https://api.mistral.ai/v1/chat/completions',
  );

  server.setupTestEnvironment();

  it('should stream text deltas', async () => {
    server.responseChunks = [
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"role":"assistant","content":""},"finish_reason":null,"logprobs":null}]}\n\n`,
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"role":"assistant","content":"Hello"},"finish_reason":null,"logprobs":null}]}\n\n`,
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"role":"assistant","content":", "},"finish_reason":null,"logprobs":null}]}\n\n`,
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"role":"assistant","content":"world!"},"finish_reason":null,"logprobs":null}]}\n\n`,
      `data:  {"id":"6e2cd91750904b7092f49bdca9083de1","object":"chat.completion.chunk",` +
        `"created":1711097175,"model":"mistral-small-latest","choices":[{"index":0,` +
        `"delta":{"content":""},"finish_reason":"stop","logprobs":null}],` +
        `"usage":{"prompt_tokens":4,"total_tokens":36,"completion_tokens":32}}\n\n`,
      `data: [DONE]\n\n`,
    ];

    const { stream } = await mistral.chat('mistral-small-latest').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'Hello' },
      { type: 'text-delta', textDelta: ', ' },
      { type: 'text-delta', textDelta: 'world!' },
      { type: 'text-delta', textDelta: '' },
    ]);
  });

  it('should pass the api key as Authorization header', async () => {
    server.responseChunks = ['data: [DONE]\n\n'];

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

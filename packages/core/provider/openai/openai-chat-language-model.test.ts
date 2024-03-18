import { LanguageModelV1Prompt } from '../../ai-model-specification/dist';
import { convertStreamToArray } from '../test/convert-stream-to-array';
import { StreamingTestServer } from '../test/streaming-test-server';
import { OpenAI } from './openai-facade';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

const openai = new OpenAI({ apiKey: 'test-api-key' });

describe('doStream', () => {
  const server = new StreamingTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  // TODO test tool call parsing

  it('should stream text deltas', async () => {
    server.responseChunks = [
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{"content":"A"},"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":1,"delta":{"role":"assistant","content":""},"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":1,"delta":{"content":"B"},"finish_reason":null}]}\n\n`,
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n`,
      `data: {"id":"chatcmpl-123","object":"chat.completion.chunk","created":1702657020,"model":"gpt-3.5-turbo-0613",` +
        `"system_fingerprint":null,"choices":[{"index":1,"delta":{},"finish_reason":"stop"}]}\n\n`,
      'data: [DONE]\n\n',
    ];

    const { stream } = await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      stream: true,
      model: 'gpt-3.5-turbo',
      messages: TEST_PROMPT,
    });

    // note: space moved to last chunk bc of trimming
    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'A' },
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'B' },
    ]);
  });

  it('should scale the temperature', async () => {
    server.responseChunks = ['data: [DONE]\n\n'];

    await openai.chat('gpt-3.5-turbo').doStream({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
      temperature: 0.5,
    });

    expect((await server.getRequestBodyJson()).temperature).toBeCloseTo(1, 5);
  });

  it('should scale the frequency penalty', async () => {
    server.responseChunks = ['data: [DONE]\n\n'];

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
    server.responseChunks = ['data: [DONE]\n\n'];

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
    server.responseChunks = ['data: [DONE]\n\n'];

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
    server.responseChunks = ['data: [DONE]\n\n'];

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

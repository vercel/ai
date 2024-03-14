import { openai } from '..';
import { LanguageModelV1Prompt } from '../../ai-model-specification/dist';
import { convertStreamToArray } from '../test/convert-stream-to-array';
import { StreamingTestServer } from '../test/streaming-test-server';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

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

    const { stream } = await openai
      .chat({ id: 'gpt-3.5-turbo', apiKey: 'test-api-key' })
      .doStream({
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

    await openai
      .chat({ id: 'gpt-3.5-turbo', apiKey: 'test-api-key' })
      .doStream({
        inputFormat: 'prompt',
        mode: { type: 'regular' },
        prompt: TEST_PROMPT,
        temperature: 0.5,
      });

    expect((await server.getRequestBodyJson()).temperature).toBeCloseTo(1, 5);
  });

  it('should scale the frequency penalty', async () => {
    server.responseChunks = ['data: [DONE]\n\n'];

    await openai
      .chat({ id: 'gpt-3.5-turbo', apiKey: 'test-api-key' })
      .doStream({
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

    await openai
      .chat({ id: 'gpt-3.5-turbo', apiKey: 'test-api-key' })
      .doStream({
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
});

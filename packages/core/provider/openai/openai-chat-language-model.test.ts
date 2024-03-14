import { openai } from '..';
import { convertStreamToArray } from '../test/convert-stream-to-array';
import { StreamingTestServer } from '../test/streaming-test-server';

describe('doStream', () => {
  const server = new StreamingTestServer(
    'https://api.openai.com/v1/chat/completions',
  );

  server.setupTestEnvironment();

  // TODO test that request is correct
  // TODO test tool call parsing

  it('should return a text stream', async () => {
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
        prompt: [
          { role: 'user', content: [{ type: 'text', text: "'Hello'" }] },
        ],
      });

    // note: space moved to last chunk bc of trimming
    expect(await convertStreamToArray(stream)).toStrictEqual([
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'A' },
      { type: 'text-delta', textDelta: '' },
      { type: 'text-delta', textDelta: 'B' },
    ]);
  });
});

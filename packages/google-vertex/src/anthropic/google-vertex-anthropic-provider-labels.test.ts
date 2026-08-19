import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGoogleVertexAnthropic } from './google-vertex-anthropic-provider-node';

const modelId = 'claude-3-haiku@20240307';
const rawPredictUrl = `https://test.example/${modelId}:rawPredict`;
const streamRawPredictUrl = `https://test.example/${modelId}:streamRawPredict`;
const labels = {
  team: 'data-platform',
  feature: 'my-app',
};
const encodedLabels =
  'eyJ0ZWFtIjoiZGF0YS1wbGF0Zm9ybSIsImZlYXR1cmUiOiJteS1hcHAifQ==';

const server = createTestServer({
  [rawPredictUrl]: {},
  [streamRawPredictUrl]: {},
});

const provider = createGoogleVertexAnthropic({
  baseURL: 'https://test.example',
  generateAuthToken: async () => 'test-token',
});

function prepareJsonResponse() {
  server.urls[rawPredictUrl].response = {
    type: 'json-value',
    body: {
      id: 'msg_test',
      type: 'message',
      role: 'assistant',
      content: [{ type: 'text', text: 'Hello!' }],
      model: modelId,
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: {
        input_tokens: 4,
        output_tokens: 2,
      },
    },
  };
}

function prepareStreamResponse() {
  server.urls[streamRawPredictUrl].response = {
    type: 'stream-chunks',
    chunks: [
      `data: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"${modelId}","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":4,"output_tokens":0}}}\n\n`,
      'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
      'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello!"}}\n\n',
      'data: {"type":"content_block_stop","index":0}\n\n',
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ],
  };
}

describe('google-vertex-anthropic-provider billing labels', () => {
  beforeEach(() => {
    prepareJsonResponse();
    prepareStreamResponse();
  });

  it('adds labels to rawPredict requests', async () => {
    await provider(modelId).doGenerate({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      providerOptions: {
        vertex: { labels },
      },
    });

    expect(server.calls[0].requestUrl).toBe(rawPredictUrl);
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-token',
      'x-vertex-ai-labels': encodedLabels,
    });
  });

  it('adds labels to streamRawPredict requests', async () => {
    const { stream } = await provider(modelId).doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'Hello' }] }],
      providerOptions: {
        googleVertex: { labels },
      },
    });

    await convertReadableStreamToArray(stream);

    expect(server.calls[0].requestUrl).toBe(streamRawPredictUrl);
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-token',
      'x-vertex-ai-labels': encodedLabels,
    });
  });
});

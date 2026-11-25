import {
  InvalidArgumentError,
  type LanguageModelV4CallOptions,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createGoogleVertexAnthropic } from './google-vertex-anthropic-provider-node';
import { createGoogleVertexAnthropic as createEdgeProvider } from './edge/google-vertex-anthropic-provider-edge';

const modelId = 'claude-sonnet-4-6@default';
const baseURL =
  'https://us-east5-aiplatform.googleapis.com/v1/projects/test-project/locations/us-east5/publishers/anthropic/models';
const prompt: LanguageModelV4CallOptions['prompt'] = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];
const labels = { team: 'data-platform', feature: 'my-app' };
const expectedHeader =
  'eyJ0ZWFtIjoiZGF0YS1wbGF0Zm9ybSIsImZlYXR1cmUiOiJteS1hcHAifQ==';

describe.each([
  ['Node', createGoogleVertexAnthropic],
  ['Edge', createEdgeProvider],
] as const)('%s Vertex Anthropic labels', (_runtime, createProvider) => {
  const server = createTestServer({
    [`${baseURL}/${modelId}:rawPredict`]: {},
    [`${baseURL}/${modelId}:streamRawPredict`]: {},
  });
  const model = createProvider({
    project: 'test-project',
    location: 'us-east5',
    generateAuthToken: async () => 'test-token',
    headers: { 'x-custom-header': 'preserved' },
  })(modelId);

  beforeEach(() => {
    const message = {
      id: 'msg-test',
      type: 'message',
      role: 'assistant',
      model: modelId,
      content: [],
      stop_reason: 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    };
    server.urls[`${baseURL}/${modelId}:rawPredict`].response = {
      type: 'json-value',
      body: message,
    };
    server.urls[`${baseURL}/${modelId}:streamRawPredict`].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({ type: 'message_start', message })}\n\n`,
        'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":1}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ],
    };
  });

  describe.each(['generate', 'stream'] as const)('%s', method => {
    async function call(
      options: Omit<LanguageModelV4CallOptions, 'prompt'> = {},
      targetModel = model,
    ) {
      if (method === 'generate') {
        await targetModel.doGenerate({ prompt, ...options });
      } else {
        const result = await targetModel.doStream({ prompt, ...options });
        const chunks = await convertReadableStreamToArray(result.stream);
        expect(chunks.some(chunk => chunk.type === 'error')).toBe(false);
      }
    }

    it('sends labels in the header and preserves authentication and other headers', async () => {
      await call({
        providerOptions: { vertex: { labels } },
        headers: {
          'anthropic-beta': 'test-beta',
          'x-request-header': 'preserved',
        },
      });

      expect(server.calls[0].requestHeaders).toMatchObject({
        'x-vertex-ai-labels': expectedHeader,
        authorization: 'Bearer test-token',
        'x-custom-header': 'preserved',
        'anthropic-beta': 'test-beta',
        'x-request-header': 'preserved',
      });
      expect(await server.calls[0].requestBodyJson).not.toHaveProperty(
        'labels',
      );
    });

    it.each([undefined, { vertex: {} }])(
      'omits the header when labels are absent (%j)',
      async providerOptions => {
        await call({ providerOptions });
        expect(server.calls[0].requestHeaders).not.toHaveProperty(
          'x-vertex-ai-labels',
        );
      },
    );

    it('encodes an empty labels map', async () => {
      await call({ providerOptions: { vertex: { labels: {} } } });
      expect(server.calls[0].requestHeaders['x-vertex-ai-labels']).toBe('e30=');
    });

    it('encodes labels as UTF-8', async () => {
      await call({
        providerOptions: { vertex: { labels: { team: 'équipe' } } },
      });
      expect(server.calls[0].requestHeaders['x-vertex-ai-labels']).toBe(
        'eyJ0ZWFtIjoiw6lxdWlwZSJ9',
      );
    });

    it.each(['x-vertex-ai-labels', 'X-Vertex-AI-Labels'])(
      'preserves an explicit %s request header',
      async name => {
        await call({
          providerOptions: { vertex: { labels } },
          headers: { [name]: 'explicit-labels' },
        });
        expect(server.calls[0].requestHeaders['x-vertex-ai-labels']).toBe(
          'explicit-labels',
        );
      },
    );

    it('preserves an explicit provider labels header', async () => {
      const modelWithLabelsHeader = createProvider({
        project: 'test-project',
        location: 'us-east5',
        generateAuthToken: async () => 'test-token',
        headers: { 'X-Vertex-AI-Labels': 'provider-labels' },
      })(modelId);

      await call(
        { providerOptions: { vertex: { labels } } },
        modelWithLabelsHeader,
      );
      expect(server.calls[0].requestHeaders['x-vertex-ai-labels']).toBe(
        'provider-labels',
      );
    });

    it.each([
      { labels: null },
      { labels: 'invalid' },
      { labels: { team: 123 } },
      { labels: ['team'] },
    ])(
      'rejects invalid labels ($labels) before sending a request',
      async ({ labels }) => {
        await expect(
          call({ providerOptions: { vertex: { labels } } }),
        ).rejects.toBeInstanceOf(InvalidArgumentError);
        expect(server.calls).toHaveLength(0);
      },
    );

    it('keeps labels isolated across concurrent and subsequent calls', async () => {
      await Promise.all([
        call({ providerOptions: { vertex: { labels } } }),
        call({ providerOptions: { vertex: { labels: { team: 'other' } } } }),
      ]);
      expect(
        server.calls
          .map(call => call.requestHeaders['x-vertex-ai-labels'])
          .sort(),
      ).toEqual([expectedHeader, 'eyJ0ZWFtIjoib3RoZXIifQ=='].sort());

      await call();
      expect(server.calls[2].requestHeaders).not.toHaveProperty(
        'x-vertex-ai-labels',
      );
    });
  });
});

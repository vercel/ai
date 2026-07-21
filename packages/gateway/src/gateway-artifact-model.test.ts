import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import type { GatewayConfig } from './gateway-config';
import { GatewayArtifactModel } from './gateway-artifact-model';

const TEST_MODEL_ID = 'fal/tripo3d/h3.1/text-to-3d';

const defaultOptions = {
  prompt: undefined,
  inputs: undefined,
  providerOptions: {},
} as const;

function createTestModel(
  config: Partial<
    GatewayConfig & { o11yHeaders?: Record<string, string> }
  > = {},
) {
  return new GatewayArtifactModel(TEST_MODEL_ID, {
    provider: 'gateway',
    baseURL: 'https://api.test.com',
    headers: () => ({
      Authorization: 'Bearer test-token',
      'ai-gateway-auth-method': 'api-key',
    }),
    fetch: globalThis.fetch,
    o11yHeaders: config.o11yHeaders ?? {},
    ...config,
  });
}

describe('GatewayArtifactModel', () => {
  const server = createTestServer({
    'https://api.test.com/artifact-model': {},
  });

  function prepareSseResponse({
    artifacts = [
      {
        type: 'url' as const,
        url: 'https://example.com/model.glb',
        mediaType: 'model/gltf-binary',
        filename: 'model.glb',
        role: 'model_mesh',
      },
    ],
    warnings,
    providerMetadata,
  }: {
    artifacts?: Array<Record<string, unknown>>;
    warnings?: Array<Record<string, unknown>>;
    providerMetadata?: Record<string, unknown>;
  } = {}) {
    server.urls['https://api.test.com/artifact-model'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'result',
          artifacts,
          ...(warnings && { warnings }),
          ...(providerMetadata && { providerMetadata }),
        })}\n\n`,
      ],
    };
  }

  it('exposes the artifact model identity', () => {
    const model = createTestModel();

    expect(model.modelId).toBe(TEST_MODEL_ID);
    expect(model.provider).toBe('gateway');
    expect(model.specificationVersion).toBe('v4');
  });

  it('posts the v4 artifact request with model and observability headers', async () => {
    prepareSseResponse();

    await createTestModel({
      o11yHeaders: { 'ai-o11y-deployment-id': 'dpl_123' },
    }).doGenerate({
      prompt: 'A red fox',
      inputs: [
        {
          type: 'file',
          data: new Uint8Array([1, 2, 3]),
          mediaType: 'image/png',
          filename: 'front.png',
          role: 'front',
          providerOptions: { fal: { crop: true } },
        },
        {
          type: 'url',
          url: 'https://example.com/back.png',
          mediaType: 'image/png',
          filename: 'back.png',
          role: 'back',
        },
      ],
      providerOptions: { fal: { face_limit: 20_000 } },
      headers: { 'X-Custom-Header': 'custom-value' },
    });

    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-token',
      'ai-artifact-model-specification-version': '4',
      'ai-model-id': TEST_MODEL_ID,
      'ai-o11y-deployment-id': 'dpl_123',
      'x-custom-header': 'custom-value',
    });
    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      prompt: 'A red fox',
      inputs: [
        {
          type: 'file',
          data: 'AQID',
          mediaType: 'image/png',
          filename: 'front.png',
          role: 'front',
          providerOptions: { fal: { crop: true } },
        },
        {
          type: 'url',
          url: 'https://example.com/back.png',
          mediaType: 'image/png',
          filename: 'back.png',
          role: 'back',
        },
      ],
      providerOptions: { fal: { face_limit: 20_000 } },
    });
  });

  it('omits absent prompt and inputs', async () => {
    prepareSseResponse();

    await createTestModel().doGenerate(defaultOptions);

    expect(await server.calls[0].requestBodyJson).toStrictEqual({
      providerOptions: {},
    });
  });

  it('preserves multiple artifact filenames and roles from SSE', async () => {
    const artifacts = [
      {
        type: 'url' as const,
        url: 'https://example.com/model.glb',
        mediaType: 'model/gltf-binary',
        filename: 'model.glb',
        role: 'glb',
      },
      {
        type: 'base64' as const,
        data: 'b2Jq',
        mediaType: 'model/obj',
        filename: 'model.obj',
        role: 'obj',
      },
    ];
    prepareSseResponse({ artifacts });

    const result = await createTestModel().doGenerate(defaultOptions);

    expect(result.artifacts).toStrictEqual(artifacts);
  });

  it('decodes JSON-safe binary artifact arrays', async () => {
    prepareSseResponse({
      artifacts: [
        {
          type: 'binary',
          data: [1, 2, 3],
          mediaType: 'application/octet-stream',
          filename: 'model.fbx',
          role: 'fbx',
        },
      ],
    });

    const result = await createTestModel().doGenerate(defaultOptions);

    expect(result.artifacts).toStrictEqual([
      {
        type: 'binary',
        data: new Uint8Array([1, 2, 3]),
        mediaType: 'application/octet-stream',
        filename: 'model.fbx',
        role: 'fbx',
      },
    ]);
  });

  it('accepts a non-streaming JSON result', async () => {
    const artifacts = [
      {
        type: 'url',
        url: 'https://example.com/model.glb',
        mediaType: 'model/gltf-binary',
        filename: 'model.glb',
        role: 'glb',
      },
    ];
    server.urls['https://api.test.com/artifact-model'].response = {
      type: 'json-value',
      body: { artifacts },
    };

    const result = await createTestModel().doGenerate(defaultOptions);

    expect(result.artifacts).toStrictEqual(artifacts);
    expect(result.warnings).toStrictEqual([]);
  });

  it('returns warnings, provider metadata, and response metadata', async () => {
    const warnings = [
      { type: 'other', message: 'Texture resolution was reduced' },
    ];
    const providerMetadata = {
      fal: { requestId: 'req_123' },
      gateway: { routing: { provider: 'fal' } },
    };
    prepareSseResponse({ warnings, providerMetadata });

    const result = await createTestModel().doGenerate(defaultOptions);

    expect(result.warnings).toStrictEqual(warnings);
    expect(result.providerMetadata).toStrictEqual(providerMetadata);
    expect(result.response).toMatchObject({
      modelId: TEST_MODEL_ID,
      timestamp: expect.any(Date),
      headers: expect.any(Object),
    });
  });

  it('throws the gateway error from an SSE error event', async () => {
    server.urls['https://api.test.com/artifact-model'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({
          type: 'error',
          message: 'Artifact job failed',
          errorType: 'internal_server_error',
          statusCode: 500,
          param: null,
        })}\n\n`,
      ],
    };

    await expect(createTestModel().doGenerate(defaultOptions)).rejects.toThrow(
      'Artifact job failed',
    );
  });

  it('throws on a malformed artifact event', async () => {
    server.urls['https://api.test.com/artifact-model'].response = {
      type: 'stream-chunks',
      chunks: [
        `data: ${JSON.stringify({ type: 'result', artifacts: [{}] })}\n\n`,
      ],
    };

    await expect(
      createTestModel().doGenerate(defaultOptions),
    ).rejects.toThrow();
  });

  it.each(['SSE', 'JSON'])(
    'rejects a malformed artifact URL from %s',
    async format => {
      const artifacts = [
        {
          type: 'url',
          url: 'not-an-absolute-url',
          mediaType: 'model/gltf-binary',
        },
      ];

      server.urls['https://api.test.com/artifact-model'].response =
        format === 'SSE'
          ? {
              type: 'stream-chunks',
              chunks: [
                `data: ${JSON.stringify({ type: 'result', artifacts })}\n\n`,
              ],
            }
          : {
              type: 'json-value',
              body: { artifacts },
            };

      await expect(
        createTestModel().doGenerate(defaultOptions),
      ).rejects.toThrow();
    },
  );

  it('throws on an empty SSE stream', async () => {
    server.urls['https://api.test.com/artifact-model'].response = {
      type: 'stream-chunks',
      chunks: [],
    };

    await expect(
      createTestModel().doGenerate(defaultOptions),
    ).rejects.toThrow();
  });
});

import {
  APICallError,
  type Experimental_ArtifactModelV4,
  type Experimental_ArtifactModelV4ArtifactData,
  type SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';
import { NoArtifactGeneratedError } from '../error/no-artifact-generated-error';
import { MockArtifactModelV4 } from '../test/mock-artifact-model-v4';
import type { Warning } from '../types/warning';
import { experimental_generateArtifact } from './generate-artifact';

vi.mock('../version', () => ({
  VERSION: '0.0.0-test',
}));

const testDate = new Date(2026, 0, 1);

function createMockResponse(options: {
  artifacts: Array<Experimental_ArtifactModelV4ArtifactData>;
  warnings?: Array<Warning>;
  providerMetadata?: SharedV4ProviderMetadata;
  timestamp?: Date;
  modelId?: string;
  headers?: Record<string, string>;
}) {
  return {
    artifacts: options.artifacts,
    warnings: options.warnings ?? [],
    providerMetadata: options.providerMetadata,
    response: {
      timestamp: options.timestamp ?? testDate,
      modelId: options.modelId ?? 'test-model-id',
      headers: options.headers,
    },
  };
}

describe('experimental_generateArtifact', () => {
  it('passes text, multi-image, and existing artifact inputs to the model', async () => {
    const abortController = new AbortController();
    let capturedOptions!: Parameters<
      Experimental_ArtifactModelV4['doGenerate']
    >[0];

    await experimental_generateArtifact({
      model: new MockArtifactModelV4({
        doGenerate: async options => {
          capturedOptions = options;
          return createMockResponse({
            artifacts: [
              {
                type: 'base64',
                data: 'Z2xURg==',
                mediaType: 'model/gltf-binary',
              },
            ],
          });
        },
      }),
      prompt: 'a low-poly fox',
      inputs: [
        {
          data: 'https://example.com/front.png',
          mediaType: 'image/png',
          filename: 'front.png',
          role: 'front',
          providerOptions: { test: { weight: 0.8 } },
        },
        {
          data: 'data:image/jpeg;base64,/9j/4AAQ',
          filename: 'side.jpg',
          role: 'side',
        },
        {
          data: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
          mediaType: 'model/gltf-binary',
          filename: 'source.glb',
          role: 'source',
        },
      ],
      providerOptions: { test: { topology: 'quad' } },
      headers: { 'x-test': 'request' },
      abortSignal: abortController.signal,
    });

    expect(capturedOptions).toStrictEqual({
      prompt: 'a low-poly fox',
      inputs: [
        {
          type: 'url',
          url: 'https://example.com/front.png',
          mediaType: 'image/png',
          filename: 'front.png',
          role: 'front',
          providerOptions: { test: { weight: 0.8 } },
        },
        {
          type: 'file',
          data: '/9j/4AAQ',
          mediaType: 'image/jpeg',
          filename: 'side.jpg',
          role: 'side',
          providerOptions: undefined,
        },
        {
          type: 'file',
          data: new Uint8Array([0x67, 0x6c, 0x54, 0x46]),
          mediaType: 'model/gltf-binary',
          filename: 'source.glb',
          role: 'source',
          providerOptions: undefined,
        },
      ],
      providerOptions: { test: { topology: 'quad' } },
      headers: {
        'x-test': 'request',
        'user-agent': 'ai/0.0.0-test',
      },
      abortSignal: abortController.signal,
    });
  });

  it('supports text-only generation', async () => {
    let capturedOptions!: Parameters<
      Experimental_ArtifactModelV4['doGenerate']
    >[0];

    await experimental_generateArtifact({
      model: new MockArtifactModelV4({
        doGenerate: async options => {
          capturedOptions = options;
          return createMockResponse({
            artifacts: [
              {
                type: 'base64',
                data: 'Z2xURg==',
                mediaType: 'model/gltf-binary',
              },
            ],
          });
        },
      }),
      prompt: 'a chair',
    });

    expect(capturedOptions.prompt).toBe('a chair');
    expect(capturedOptions.inputs).toBeUndefined();
  });

  it('resolves string model IDs through the global provider', async () => {
    const artifactModel = new MockArtifactModelV4({
      provider: 'global-test-provider',
      modelId: 'resolved-model-id',
      doGenerate: async () =>
        createMockResponse({
          artifacts: [
            {
              type: 'base64',
              data: 'Z2xURg==',
              mediaType: 'model/gltf-binary',
            },
          ],
        }),
    });
    const artifactModelFactory = vi.fn(() => artifactModel);

    globalThis.AI_SDK_DEFAULT_PROVIDER = {
      artifactModel: artifactModelFactory,
    } as unknown as NonNullable<typeof globalThis.AI_SDK_DEFAULT_PROVIDER>;

    try {
      const result = await experimental_generateArtifact({
        model: 'provider/model-id',
        prompt: 'a chair',
      });

      expect(artifactModelFactory).toHaveBeenCalledWith('provider/model-id');
      expect(result.artifact.mediaType).toBe('model/gltf-binary');
    } finally {
      delete globalThis.AI_SDK_DEFAULT_PROVIDER;
    }
  });

  it('returns URL, base64, and binary artifacts in order with metadata', async () => {
    const download = vi.fn(async () => ({
      data: new Uint8Array([1, 2, 3]),
      mediaType: 'application/octet-stream',
    }));
    const binary = new Uint8Array([4, 5, 6]);

    const result = await experimental_generateArtifact({
      model: new MockArtifactModelV4({
        doGenerate: async () =>
          createMockResponse({
            artifacts: [
              {
                type: 'url',
                url: 'https://example.com/model.glb',
                mediaType: 'model/gltf-binary',
                filename: 'model.glb',
                role: 'model',
              },
              {
                type: 'base64',
                data: 'bXRsbA==',
                mediaType: 'model/mtl',
                filename: 'model.mtl',
                role: 'material',
              },
              {
                type: 'binary',
                data: binary,
                mediaType: 'image/png',
                filename: 'preview.png',
                role: 'preview',
              },
            ],
            providerMetadata: {
              test: { requestId: 'request-1' },
            },
            headers: { 'x-request-id': 'request-1' },
          }),
      }),
      prompt: 'a chair',
      download,
    });

    expect(download).toHaveBeenCalledWith({
      url: new URL('https://example.com/model.glb'),
      abortSignal: undefined,
    });
    expect(result.artifacts).toHaveLength(3);
    expect(result.artifact).toBe(result.artifacts[0]);
    expect(result.artifacts[0]).toMatchObject({
      mediaType: 'model/gltf-binary',
      filename: 'model.glb',
      role: 'model',
      uint8Array: new Uint8Array([1, 2, 3]),
    });
    expect(result.artifacts[1]).toMatchObject({
      mediaType: 'model/mtl',
      filename: 'model.mtl',
      role: 'material',
      base64: 'bXRsbA==',
    });
    expect(result.artifacts[2]).toMatchObject({
      mediaType: 'image/png',
      filename: 'preview.png',
      role: 'preview',
      uint8Array: binary,
    });
    expect(result.responses).toStrictEqual([
      {
        timestamp: testDate,
        modelId: 'test-model-id',
        headers: { 'x-request-id': 'request-1' },
        providerMetadata: { test: { requestId: 'request-1' } },
      },
    ]);
    expect(result.providerMetadata).toStrictEqual({
      test: { requestId: 'request-1' },
    });
  });

  it('downloads URL artifacts sequentially and preserves their order', async () => {
    let activeDownloads = 0;
    let maxActiveDownloads = 0;

    const download = vi.fn(async ({ url }: { url: URL }) => {
      activeDownloads++;
      maxActiveDownloads = Math.max(maxActiveDownloads, activeDownloads);
      await Promise.resolve();
      activeDownloads--;

      return {
        data: new Uint8Array([Number(url.pathname.at(-5))]),
        mediaType: 'model/gltf-binary',
      };
    });

    const result = await experimental_generateArtifact({
      model: new MockArtifactModelV4({
        doGenerate: async () =>
          createMockResponse({
            artifacts: [1, 2, 3].map(index => ({
              type: 'url' as const,
              url: `https://example.com/model-${index}.glb`,
              mediaType: 'model/gltf-binary',
            })),
          }),
      }),
      prompt: 'a chair',
      download,
    });

    expect(maxActiveDownloads).toBe(1);
    expect(download.mock.calls.map(([{ url }]) => url.pathname)).toStrictEqual([
      '/model-1.glb',
      '/model-2.glb',
      '/model-3.glb',
    ]);
    expect(result.artifacts.map(artifact => artifact.uint8Array[0])).toEqual([
      1, 2, 3,
    ]);
  });

  const mediaTypeCases: Array<{
    name: string;
    providerMediaType: string;
    downloadedMediaType: string | undefined;
    filename: string | undefined;
    url: string;
    data: Uint8Array;
    expectedMediaType: string;
  }> = [
    {
      name: 'prefers a specific provider media type',
      providerMediaType: 'model/gltf-binary',
      downloadedMediaType: 'model/obj',
      filename: 'model.stl',
      url: 'https://example.com/download',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      expectedMediaType: 'model/gltf-binary',
    },
    {
      name: 'uses the downloaded media type when the provider type is generic',
      providerMediaType: 'application/octet-stream',
      downloadedMediaType: 'model/obj',
      filename: 'model.glb',
      url: 'https://example.com/download',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      expectedMediaType: 'model/obj',
    },
    {
      name: 'infers the media type from the filename when explicit types are generic',
      providerMediaType: 'application/octet-stream',
      downloadedMediaType: 'application/octet-stream',
      filename: 'MODEL.GLB',
      url: 'https://example.com/download',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      expectedMediaType: 'model/gltf-binary',
    },
    {
      name: 'infers the media type from content when no filename type is available',
      providerMediaType: 'application/octet-stream',
      downloadedMediaType: undefined,
      filename: undefined,
      url: 'https://example.com/download',
      data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      expectedMediaType: 'image/png',
    },
  ];

  it.each(mediaTypeCases)(
    '$name',
    async ({
      providerMediaType,
      downloadedMediaType,
      filename,
      url,
      data,
      expectedMediaType,
    }) => {
      const result = await experimental_generateArtifact({
        model: new MockArtifactModelV4({
          doGenerate: async () =>
            createMockResponse({
              artifacts: [
                {
                  type: 'url',
                  url,
                  mediaType: providerMediaType,
                  ...(filename != null ? { filename } : {}),
                },
              ],
            }),
        }),
        prompt: 'a chair',
        download: async () => ({ data, mediaType: downloadedMediaType }),
      });

      expect(result.artifact.mediaType).toBe(expectedMediaType);
    },
  );

  it('throws NoArtifactGeneratedError with response metadata', async () => {
    const promise = experimental_generateArtifact({
      model: new MockArtifactModelV4({
        doGenerate: async () =>
          createMockResponse({
            artifacts: [],
            providerMetadata: { test: { requestId: 'request-2' } },
            headers: { 'x-request-id': 'request-2' },
          }),
      }),
      prompt: 'a chair',
    });

    await expect(promise).rejects.toBeInstanceOf(NoArtifactGeneratedError);
    await expect(promise).rejects.toMatchObject({
      name: 'AI_NoArtifactGeneratedError',
      message: 'No artifact generated.',
      responses: [
        {
          timestamp: testDate,
          modelId: 'test-model-id',
          headers: { 'x-request-id': 'request-2' },
          providerMetadata: { test: { requestId: 'request-2' } },
        },
      ],
    });
  });

  it('does not retry a paid provider job by default', async () => {
    const doGenerate = vi.fn(async () => {
      throw new APICallError({
        message: 'temporary provider error',
        url: 'https://example.com/jobs',
        requestBodyValues: {},
        isRetryable: true,
      });
    });

    await expect(
      experimental_generateArtifact({
        model: new MockArtifactModelV4({ doGenerate }),
        prompt: 'a chair',
      }),
    ).rejects.toThrow('temporary provider error');

    expect(doGenerate).toHaveBeenCalledOnce();
  });
});

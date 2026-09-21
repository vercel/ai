import {
  InvalidArgumentError,
  LoadAPIKeyError,
  NoSuchModelError,
  type ImageModelV4CallOptions,
} from '@ai-sdk/provider';
import { convertUint8ArrayToBase64 } from '@ai-sdk/provider-utils';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  animateSvgResponseFixture,
  editSvgResponseFixture,
  generateSvgResponseFixture,
  vectorizeSvgResponseFixture,
} from './__fixtures__/quiverai-fixtures';
import { prepareQuiverAIImageReference } from './prepare-quiverai-image-reference';
import { createQuiverAI } from './quiverai-provider';

const decoder = new TextDecoder();
const encoder = new TextEncoder();
const convertToBase64 = (value: string) =>
  convertUint8ArrayToBase64(encoder.encode(value));
const canonicalModelIds = [
  'arrow-1',
  'arrow-1.1',
  'arrow-1.1-max',
  'arrow-2',
  'arrow-2-telos',
] as const;

const server = createTestServer({
  'https://api.quiver.ai/v1/svgs/generations': {
    response: {
      type: 'json-value',
      body: generateSvgResponseFixture,
    },
  },
  'https://env.quiver.ai/v1/svgs/generations': {
    response: {
      type: 'json-value',
      body: generateSvgResponseFixture,
    },
  },
  'https://override.quiver.ai/v1/svgs/generations': {
    response: {
      type: 'json-value',
      body: generateSvgResponseFixture,
    },
  },
  'https://api.quiver.ai/v1/svgs/vectorizations': {
    response: {
      type: 'json-value',
      body: vectorizeSvgResponseFixture,
    },
  },
  'https://api.quiver.ai/v1/svgs/edits': {
    response: {
      type: 'json-value',
      body: editSvgResponseFixture,
    },
  },
  'https://api.quiver.ai/v1/svgs/animations': {
    response: {
      type: 'json-value',
      body: animateSvgResponseFixture,
    },
  },
});

const generateOptions: ImageModelV4CallOptions = {
  prompt: 'Draw a square icon.',
  n: 1,
  size: undefined,
  aspectRatio: undefined,
  seed: undefined,
  files: undefined,
  mask: undefined,
  providerOptions: {},
};

describe('createQuiverAI', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('uses the default base URL and auth headers', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    const result = await provider.image('arrow-1').doGenerate(generateOptions);
    const image = result.images[0];

    expect(result.images).toHaveLength(1);
    expect(image).toBeInstanceOf(Uint8Array);
    expect(decoder.decode(image as Uint8Array)).toBe(
      generateSvgResponseFixture.data[0].svg,
    );
    expect(result.providerMetadata?.quiverai).toEqual({
      images: [{ index: 0, mimeType: 'image/svg+xml' }],
    });
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 9,
      totalTokens: 21,
    });
    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].requestUrl).toBe(
      'https://api.quiver.ai/v1/svgs/generations',
    );
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
    });
    expect(server.calls[0].requestUserAgent).toContain('ai-sdk/quiverai/');
  });

  it('reads the base URL and API key from the environment', async () => {
    vi.stubEnv('QUIVERAI_API_KEY', 'env-api-key');
    vi.stubEnv('QUIVERAI_BASE_URL', 'https://env.quiver.ai/v1');

    const provider = createQuiverAI();
    await provider.imageModel('arrow-1').doGenerate(generateOptions);

    expect(server.calls).toHaveLength(1);
    expect(server.calls[0].requestUrl).toBe(
      'https://env.quiver.ai/v1/svgs/generations',
    );
    expect(server.calls[0].requestHeaders.authorization).toBe(
      'Bearer env-api-key',
    );
  });

  it('throws when the QuiverAI API key is missing', async () => {
    vi.stubEnv('QUIVERAI_API_KEY', undefined);
    const provider = createQuiverAI();

    const result = provider.image('arrow-1').doGenerate(generateOptions);

    await expect(result).rejects.toBeInstanceOf(LoadAPIKeyError);
    await expect(result).rejects.toThrow(
      "QuiverAI API key is missing. Pass it using the 'apiKey' parameter or the QUIVERAI_API_KEY environment variable.",
    );
  });

  it('prefers explicit options and exposes image factory methods', async () => {
    vi.stubEnv('QUIVERAI_API_KEY', 'env-api-key');
    vi.stubEnv('QUIVERAI_BASE_URL', 'https://env.quiver.ai/v1');

    const provider = createQuiverAI({
      apiKey: 'override-api-key',
      baseURL: 'https://override.quiver.ai/v1',
      headers: { 'X-QuiverAI-Test': '1' },
    });

    expect(provider.image('arrow-1').modelId).toBe('arrow-1');
    expect(provider.imageModel('arrow-1').provider).toBe('quiverai.image');

    await provider.image('arrow-1').doGenerate(generateOptions);

    expect(server.calls[0].requestUrl).toBe(
      'https://override.quiver.ai/v1/svgs/generations',
    );
    expect(server.calls[0].requestHeaders).toMatchObject({
      authorization: 'Bearer override-api-key',
      'x-quiverai-test': '1',
    });
  });

  it('throws for unsupported language and embedding models', () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    expect(() => provider.languageModel('chat-model')).toThrow(
      NoSuchModelError,
    );
    expect(() => provider.embeddingModel('embed-model')).toThrow(
      NoSuchModelError,
    );
    expect(() => provider.textEmbeddingModel('embed-model')).toThrow(
      NoSuchModelError,
    );
  });

  it('supports all canonical Quiver model ids', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    for (const modelId of canonicalModelIds) {
      expect(provider.image(modelId).modelId).toBe(modelId);
      expect(provider.imageModel(modelId).modelId).toBe(modelId);
      expect(provider.image(modelId).provider).toBe('quiverai.image');

      const result = await provider.image(modelId).doGenerate(generateOptions);

      expect(decoder.decode(result.images[0] as Uint8Array)).toBe(
        generateSvgResponseFixture.data[0].svg,
      );
      expect(result.response.modelId).toBe(modelId);
    }

    expect(server.calls).toHaveLength(canonicalModelIds.length);
    expect(
      await Promise.all(server.calls.map(call => call.requestBodyJson)),
    ).toMatchObject(canonicalModelIds.map(modelId => ({ model: modelId })));
  });

  it('vectorizes an image when requested through providerOptions', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    const result = await provider.image('arrow-1').doGenerate({
      ...generateOptions,
      prompt: undefined,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([1, 2, 3]),
        },
      ],
      providerOptions: { quiverai: { operation: 'vectorize' } },
    });

    expect(decoder.decode(result.images[0] as Uint8Array)).toBe(
      vectorizeSvgResponseFixture.data[0].svg,
    );
    expect(server.calls[0].requestUrl).toBe(
      'https://api.quiver.ai/v1/svgs/vectorizations',
    );
    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'arrow-1',
      image: {
        base64: 'AQID',
      },
    });
  });

  it('animates binary SVG input without an instruction', async () => {
    const sourceSvg =
      '<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>';
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    const result = await provider.image('arrow-2').doGenerate({
      ...generateOptions,
      prompt: undefined,
      files: [
        {
          type: 'file',
          mediaType: 'image/png',
          data: new TextEncoder().encode(sourceSvg),
        },
      ],
      providerOptions: { quiverai: { operation: 'animate' } },
    });

    expect(decoder.decode(result.images[0] as Uint8Array)).toBe(
      animateSvgResponseFixture.data[0].svg,
    );
    expect(result.providerMetadata?.quiverai).toEqual({
      images: [
        {
          index: 0,
          mimeType: 'image/svg+xml',
          loopPeriodMs: 1200,
          openingAnimationMs: null,
        },
      ],
    });
    expect(server.calls[0].requestUrl).toBe(
      'https://api.quiver.ai/v1/svgs/animations',
    );
    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'arrow-2',
      svg_source: {
        base64: btoa(sourceSvg),
      },
      stream: false,
    });
  });

  it('forwards an animation instruction and supported options', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-2-telos').doGenerate({
      ...generateOptions,
      prompt: 'Make the circle pulse gently.',
      files: [
        {
          type: 'url',
          url: 'https://example.com/source.svg',
        },
      ],
      providerOptions: {
        quiverai: {
          operation: 'animate',
          temperature: 0.4,
          maxOutputTokens: 4096,
          reasoningEffort: 'medium',
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toEqual({
      model: 'arrow-2-telos',
      svg_source: {
        url: 'https://example.com/source.svg',
      },
      prompt: 'Make the circle pulse gently.',
      temperature: 0.4,
      max_output_tokens: 4096,
      reasoning_effort: 'medium',
      stream: false,
    });
  });

  it.each([
    {
      name: 'raw base64',
      data: btoa('<svg xmlns="http://www.w3.org/2000/svg"/>'),
    },
    {
      name: 'SVG data URL',
      data: `data:image/svg+xml;base64,${btoa(
        '<svg xmlns="http://www.w3.org/2000/svg"/>',
      )}`,
    },
  ])('normalizes $name animation input', async ({ data }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-2').doGenerate({
      ...generateOptions,
      prompt: undefined,
      files: [{ type: 'file', mediaType: 'image/svg+xml', data }],
      providerOptions: { quiverai: { operation: 'animate' } },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      svg_source: {
        base64: btoa('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      },
    });
  });

  it.each([
    {
      name: 'no source SVG',
      files: undefined,
      n: 1,
      modelId: 'arrow-2',
    },
    {
      name: 'multiple source SVGs',
      files: [
        {
          type: 'url' as const,
          url: 'https://example.com/source-1.svg',
        },
        {
          type: 'url' as const,
          url: 'https://example.com/source-2.svg',
        },
      ],
      n: 1,
      modelId: 'arrow-2',
    },
    {
      name: 'batched outputs',
      files: [
        {
          type: 'url' as const,
          url: 'https://example.com/source.svg',
        },
      ],
      n: 2,
      modelId: 'arrow-2',
    },
    {
      name: 'unsupported model',
      files: [
        {
          type: 'url' as const,
          url: 'https://example.com/source.svg',
        },
      ],
      n: 1,
      modelId: 'arrow-1.1',
    },
  ])('rejects animation requests with $name', async ({ files, n, modelId }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image(modelId).doGenerate({
        ...generateOptions,
        prompt: undefined,
        files,
        n,
        providerOptions: { quiverai: { operation: 'animate' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    {
      name: 'non-SVG binary input',
      files: [
        {
          type: 'file' as const,
          mediaType: 'image/png',
          data: new Uint8Array([1, 2, 3]),
        },
      ],
    },
    {
      name: 'non-HTTP URL input',
      files: [
        {
          type: 'url' as const,
          url: 'file:///source.svg',
        },
      ],
    },
    {
      name: 'malformed URL input',
      files: [
        {
          type: 'url' as const,
          url: 'https://',
        },
      ],
    },
  ])('rejects $name for animation', async ({ files }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: undefined,
        files,
        providerOptions: { quiverai: { operation: 'animate' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it('rejects animation source SVGs above the base64 size limit', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    const oversizedSvg = new TextEncoder().encode(
      `<svg xmlns="http://www.w3.org/2000/svg"><!--${'a'.repeat(
        800_000,
      )}--></svg>`,
    );

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: undefined,
        files: [
          {
            type: 'file',
            mediaType: 'image/svg+xml',
            data: oversizedSvg,
          },
        ],
        providerOptions: { quiverai: { operation: 'animate' } },
      }),
    ).rejects.toThrow('accepts at most 1066668 base64 characters');
    expect(server.calls).toHaveLength(0);
  });

  it('rejects animation masks and operation-specific provider options', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    const source = {
      type: 'url' as const,
      url: 'https://example.com/source.svg',
    };

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: undefined,
        files: [source],
        mask: source,
        providerOptions: { quiverai: { operation: 'animate' } },
      }),
    ).rejects.toThrow('does not support masks');

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: undefined,
        files: [source],
        providerOptions: {
          quiverai: { operation: 'animate', autoCrop: true },
        },
      }),
    ).rejects.toThrow('does not support providerOptions.quiverai.autoCrop');
    expect(server.calls).toHaveLength(0);
  });

  it('rejects empty animation instructions', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: '   ',
        files: [{ type: 'url', url: 'https://example.com/source.svg' }],
        providerOptions: { quiverai: { operation: 'animate' } },
      }),
    ).rejects.toThrow('requires a non-empty prompt');
    expect(server.calls).toHaveLength(0);
  });

  it.each([{ temperature: 2.1 }, { maxOutputTokens: 65537 }])(
    'rejects invalid animation options: %j',
    async quiverai => {
      const provider = createQuiverAI({ apiKey: 'test-api-key' });

      await expect(
        provider.image('arrow-2').doGenerate({
          ...generateOptions,
          prompt: undefined,
          files: [{ type: 'url', url: 'https://example.com/source.svg' }],
          providerOptions: {
            quiverai: { operation: 'animate', ...quiverai },
          },
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(server.calls).toHaveLength(0);
    },
  );

  it.each(['arrow-2', 'arrow-2-telos'])(
    'edits a binary SVG with %s and returns SVG bytes',
    async modelId => {
      const sourceSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="red"/></svg>';
      const referenceSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="blue"/></svg>';
      const provider = createQuiverAI({ apiKey: 'test-api-key' });

      const result = await provider.image(modelId).doGenerate({
        ...generateOptions,
        prompt: 'Change the rectangle fill to blue.',
        files: [
          {
            type: 'file',
            mediaType: 'image/svg+xml',
            data: new TextEncoder().encode(sourceSvg),
          },
        ],
        providerOptions: {
          quiverai: {
            operation: 'edit',
            referenceImages: [
              { url: 'https://example.com/reference.png' },
              prepareQuiverAIImageReference(
                new TextEncoder().encode(referenceSvg),
              ),
            ],
            maxReviewSteps: 2,
            reasoningEffort: 'high',
            maxOutputTokens: 4096,
            orchestratorMaxOutputTokens: 2048,
            shallowMaxOutputTokens: 1024,
            temperature: 0.3,
          },
        },
      });

      expect(result.images[0]).toBeInstanceOf(Uint8Array);
      expect(decoder.decode(result.images[0] as Uint8Array)).toBe(
        editSvgResponseFixture.data[0].svg,
      );
      expect(result.usage).toEqual({
        inputTokens: 14,
        outputTokens: 11,
        totalTokens: 25,
      });
      expect(server.calls[0].requestUrl).toBe(
        'https://api.quiver.ai/v1/svgs/edits',
      );
      expect(await server.calls[0].requestBodyJson).toEqual({
        model: modelId,
        prompt: 'Change the rectangle fill to blue.',
        svg_source: {
          base64: convertToBase64(sourceSvg),
        },
        reference_images: [
          { url: 'https://example.com/reference.png' },
          { base64: convertToBase64(referenceSvg) },
        ],
        max_review_steps: 2,
        reasoning_effort: 'high',
        settings: {
          max_output_tokens: 4096,
          orchestrator_max_output_tokens: 2048,
          shallow_max_output_tokens: 1024,
          temperature: 0.3,
        },
        stream: false,
      });
    },
  );

  it('forwards an HTTP SVG source URL for editing', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-2').doGenerate({
      ...generateOptions,
      prompt: 'Make the wordmark bolder.',
      files: [
        {
          type: 'url',
          url: 'https://example.com/source.svg',
        },
      ],
      providerOptions: { quiverai: { operation: 'edit' } },
    });

    const requestBody = await server.calls[0].requestBodyJson;
    expect(requestBody).toMatchObject({
      svg_source: { url: 'https://example.com/source.svg' },
    });
    expect(requestBody).not.toHaveProperty('settings');
  });

  it('accepts base64 SVG source data for editing', async () => {
    const sourceSvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-2').doGenerate({
      ...generateOptions,
      prompt: 'Add a blue background.',
      files: [
        {
          type: 'file',
          mediaType: 'image/svg+xml',
          data: convertToBase64(sourceSvg),
        },
      ],
      providerOptions: { quiverai: { operation: 'edit' } },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      svg_source: { base64: convertToBase64(sourceSvg) },
    });
  });

  it('accepts a structurally valid SVG followed by an XML comment', async () => {
    const sourceSvg =
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><g><path d="M0 0"/></g></svg><!-- exported by editor -->';
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-2').doGenerate({
      ...generateOptions,
      prompt: 'Make the path blue.',
      files: [
        {
          type: 'file',
          mediaType: 'image/svg+xml',
          data: encoder.encode(sourceSvg),
        },
      ],
      providerOptions: { quiverai: { operation: 'edit' } },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      svg_source: { base64: convertToBase64(sourceSvg) },
    });
  });

  it.each([
    { name: 'missing', files: undefined },
    { name: 'empty', files: [] },
    {
      name: 'multiple',
      files: [
        {
          type: 'url' as const,
          url: 'https://example.com/source-1.svg',
        },
        {
          type: 'url' as const,
          url: 'https://example.com/source-2.svg',
        },
      ],
    },
  ])('rejects $name SVG edit sources', async ({ files }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: 'Make the icon blue.',
        files,
        providerOptions: { quiverai: { operation: 'edit' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it('rejects oversized binary SVG source data before editing', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    const oversizedSvg = `<svg>${' '.repeat(200_000)}</svg>`;

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: 'Make the icon blue.',
        files: [
          {
            type: 'file',
            mediaType: 'image/svg+xml',
            data: encoder.encode(oversizedSvg),
          },
        ],
        providerOptions: { quiverai: { operation: 'edit' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    { name: 'missing', prompt: undefined },
    { name: 'blank', prompt: '   ' },
    { name: 'over 4000 characters', prompt: 'a'.repeat(4001) },
  ])('rejects a $name SVG edit instruction', async ({ prompt }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt,
        files: [
          {
            type: 'url',
            url: 'https://example.com/source.svg',
          },
        ],
        providerOptions: { quiverai: { operation: 'edit' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    {
      name: 'non-HTTP source URL',
      file: { type: 'url' as const, url: 'ftp://example.com/source.svg' },
    },
    {
      name: 'raster source data',
      file: {
        type: 'file' as const,
        mediaType: 'image/png',
        data: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      },
    },
    {
      name: 'incomplete SVG source data',
      file: {
        type: 'file' as const,
        mediaType: 'image/svg+xml',
        data: encoder.encode('<svg>'),
      },
    },
    {
      name: 'structurally malformed SVG source data',
      file: {
        type: 'file' as const,
        mediaType: 'image/svg+xml',
        data: encoder.encode('<svg><g></svg>'),
      },
    },
    {
      name: 'invalid base64 source data',
      file: {
        type: 'file' as const,
        mediaType: 'image/svg+xml',
        data: 'not base64!',
      },
    },
  ])('rejects $name before SVG editing', async ({ file }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: 'Make the icon blue.',
        files: [file],
        providerOptions: { quiverai: { operation: 'edit' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    {
      name: 'more than four reference images',
      options: {
        referenceImages: Array.from({ length: 5 }, () => ({
          url: 'https://example.com/reference.png',
        })),
      },
    },
    {
      name: 'a non-HTTP reference URL',
      options: {
        referenceImages: [{ url: 'file:///tmp/reference.png' }],
      },
    },
    {
      name: 'invalid base64 reference data',
      options: {
        referenceImages: [{ base64: 'not base64!' }],
      },
    },
    {
      name: 'unsupported reference data',
      options: {
        referenceImages: [
          { base64: convertUint8ArrayToBase64(new Uint8Array([1, 2, 3])) },
        ],
      },
    },
  ])('rejects $name before SVG editing', async ({ options }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: 'Make the icon blue.',
        files: [
          {
            type: 'url',
            url: 'https://example.com/source.svg',
          },
        ],
        providerOptions: {
          quiverai: {
            operation: 'edit',
            ...options,
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    { maxReviewSteps: -1 },
    { maxReviewSteps: 6 },
    { maxReviewSteps: 1.5 },
    { maxOutputTokens: 65537 },
    { orchestratorMaxOutputTokens: 0 },
    { orchestratorMaxOutputTokens: 65537 },
    { shallowMaxOutputTokens: 0 },
    { shallowMaxOutputTokens: 65537 },
    { temperature: -0.1 },
    { temperature: 2.1 },
  ])('rejects invalid SVG edit settings: %j', async quiveraiOptions => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        prompt: 'Make the icon blue.',
        files: [
          {
            type: 'url',
            url: 'https://example.com/source.svg',
          },
        ],
        providerOptions: {
          quiverai: {
            operation: 'edit',
            ...quiveraiOptions,
          },
        },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    {
      name: 'an unsupported model',
      modelId: 'arrow-1',
      callOptions: {},
    },
    {
      name: 'multiple outputs',
      modelId: 'arrow-2',
      callOptions: { n: 2 },
    },
    {
      name: 'a mask',
      modelId: 'arrow-2',
      callOptions: {
        mask: {
          type: 'url' as const,
          url: 'https://example.com/mask.svg',
        },
      },
    },
  ])('rejects SVG editing with $name', async ({ modelId, callOptions }) => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image(modelId).doGenerate({
        ...generateOptions,
        ...callOptions,
        prompt: 'Make the icon blue.',
        files: [
          {
            type: 'url',
            url: 'https://example.com/source.svg',
          },
        ],
        providerOptions: { quiverai: { operation: 'edit' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
    expect(server.calls).toHaveLength(0);
  });

  it.each([
    { instructions: 'Use a flat style.' },
    { attributes: { viewBox: { minX: 0, minY: 0, width: 10, height: 10 } } },
    { topP: 0.9 },
    { presencePenalty: 0.2 },
    { autoCrop: true },
    { targetSize: 1024 },
  ])(
    'rejects generation and vectorization options for SVG editing: %j',
    async unsupportedOption => {
      const provider = createQuiverAI({ apiKey: 'test-api-key' });

      await expect(
        provider.image('arrow-2').doGenerate({
          ...generateOptions,
          prompt: 'Make the icon blue.',
          files: [
            {
              type: 'url',
              url: 'https://example.com/source.svg',
            },
          ],
          providerOptions: {
            quiverai: {
              operation: 'edit',
              ...unsupportedOption,
            },
          },
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(server.calls).toHaveLength(0);
    },
  );

  it.each(['generate', 'vectorize', 'animate'] as const)(
    'rejects edit-only options for %s',
    async operation => {
      const provider = createQuiverAI({ apiKey: 'test-api-key' });

      await expect(
        provider.image('arrow-2').doGenerate({
          ...generateOptions,
          files:
            operation !== 'generate'
              ? [{ type: 'url', url: 'https://example.com/source.svg' }]
              : undefined,
          providerOptions: {
            quiverai: {
              operation,
              maxReviewSteps: 1,
            },
          },
        }),
      ).rejects.toBeInstanceOf(InvalidArgumentError);
      expect(server.calls).toHaveLength(0);
    },
  );

  it('forwards docs-backed generation options and reference images', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-1').doGenerate({
      ...generateOptions,
      files: [
        {
          type: 'url',
          url: 'https://example.com/reference-1.png',
        },
        {
          type: 'file',
          mediaType: 'image/png',
          data: new Uint8Array([4, 5, 6]),
        },
      ],
      providerOptions: {
        quiverai: {
          instructions: 'Use a flat monochrome style with clean geometry.',
          temperature: 0.4,
          topP: 0.95,
          presencePenalty: 0.2,
          maxOutputTokens: 4096,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'arrow-1',
      prompt: 'Draw a square icon.',
      instructions: 'Use a flat monochrome style with clean geometry.',
      temperature: 0.4,
      top_p: 0.95,
      presence_penalty: 0.2,
      max_output_tokens: 4096,
      stream: false,
      references: [
        { url: 'https://example.com/reference-1.png' },
        { base64: 'BAUG' },
      ],
    });
  });

  it('accepts up to 16 reference images for arrow-1.1-max', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-1.1-max').doGenerate({
      ...generateOptions,
      files: Array.from({ length: 16 }, (_, index) => ({
        type: 'url' as const,
        url: `https://example.com/reference-${index + 1}.png`,
      })),
    });

    const requestBody = (await server.calls[0].requestBodyJson) as {
      model: string;
      references: unknown[];
    };

    expect(requestBody).toMatchObject({
      model: 'arrow-1.1-max',
    });
    expect(requestBody.references).toHaveLength(16);
  });

  it('rejects more than 16 reference images for arrow-1.1-max', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-1.1-max').doGenerate({
        ...generateOptions,
        files: Array.from({ length: 17 }, (_, index) => ({
          type: 'url' as const,
          url: `https://example.com/reference-${index + 1}.png`,
        })),
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('forwards docs-backed vectorize options', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await provider.image('arrow-1').doGenerate({
      ...generateOptions,
      prompt: undefined,
      files: [
        {
          type: 'url',
          url: 'https://example.com/logo.png',
        },
      ],
      providerOptions: {
        quiverai: {
          operation: 'vectorize',
          temperature: 0.4,
          topP: 0.95,
          presencePenalty: 0.2,
          maxOutputTokens: 4096,
          autoCrop: true,
          targetSize: 1024,
        },
      },
    });

    expect(await server.calls[0].requestBodyJson).toMatchObject({
      model: 'arrow-1',
      image: {
        url: 'https://example.com/logo.png',
      },
      temperature: 0.4,
      top_p: 0.95,
      presence_penalty: 0.2,
      max_output_tokens: 4096,
      auto_crop: true,
      target_size: 1024,
      stream: false,
    });
  });

  it.each(['arrow-2', 'arrow-2-telos'])(
    'forwards Arrow 2 options for %s on both endpoints',
    async modelId => {
      const provider = createQuiverAI({ apiKey: 'test-api-key' });
      for (const operation of ['generate', 'vectorize'] as const) {
        const result = await provider.image(modelId).doGenerate({
          ...generateOptions,
          files: [{ type: 'url', url: 'https://example.com/reference.png' }],
          providerOptions: {
            quiverai: {
              operation,
              reasoningEffort: 'high',
              attributes: {
                viewBox: { minX: -10, minY: 0, width: 100, height: 50 },
              },
              maxOutputTokens: 65536,
            },
          },
        });
        expect(result.images).toHaveLength(1);
        expect(result.usage?.totalTokens).toBeGreaterThan(0);
        expect(result.providerMetadata?.quiverai).not.toHaveProperty('credits');
      }
      const requestBodies = await Promise.all(
        server.calls.map(call => call.requestBodyJson),
      );
      for (const body of requestBodies) {
        expect(body).toMatchObject({
          model: modelId,
          reasoning_effort: 'high',
          attributes: {
            viewBox: { minX: -10, minY: 0, width: 100, height: 50 },
          },
          max_output_tokens: 65536,
          stream: false,
        });
      }
      expect(requestBodies[0]).toHaveProperty('n', 1);
      expect(requestBodies[1]).not.toHaveProperty('n');
    },
  );

  it.each(['arrow-2', 'arrow-2-telos'])(
    'rejects output budgets above the limit for %s',
    async modelId => {
      const provider = createQuiverAI({ apiKey: 'test-api-key' });
      await expect(
        provider.image(modelId).doGenerate({
          ...generateOptions,
          providerOptions: { quiverai: { maxOutputTokens: 65537 } },
        }),
      ).rejects.toThrow('supports at most 65536 output tokens');
      expect(server.calls).toHaveLength(0);
    },
  );

  it('retains the legacy output budget allowance', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    await provider.image('arrow-1.1').doGenerate({
      ...generateOptions,
      providerOptions: { quiverai: { maxOutputTokens: 131072 } },
    });
    expect(await server.calls[0].requestBodyJson).toHaveProperty(
      'max_output_tokens',
      131072,
    );
  });

  it.each(['arrow-2', 'arrow-2-telos', 'future-model'])(
    'leaves model-specific reference limits to the API for %s',
    async modelId => {
      const provider = createQuiverAI({ apiKey: 'test-api-key' });
      const files = Array.from({ length: 16 }, () => ({
        type: 'url' as const,
        url: 'https://example.com/reference.png',
      }));
      await provider.image(modelId).doGenerate({ ...generateOptions, files });
      expect(
        ((await server.calls[0].requestBodyJson) as { references: unknown[] })
          .references,
      ).toHaveLength(16);
      await expect(
        provider
          .image(modelId)
          .doGenerate({ ...generateOptions, files: [...files, files[0]] }),
      ).rejects.toThrow('supports up to 16 reference images');
      expect(server.calls).toHaveLength(1);
    },
  );

  it.each(['arrow-1', 'arrow-1.0', 'arrow-1.1'])(
    'retains the four-reference limit for %s',
    async modelId => {
      const provider = createQuiverAI({ apiKey: 'test-api-key' });
      await expect(
        provider.image(modelId).doGenerate({
          ...generateOptions,
          files: Array.from({ length: 5 }, () => ({
            type: 'url' as const,
            url: 'https://example.com/reference.png',
          })),
        }),
      ).rejects.toThrow('supports up to 4 reference images');
      expect(server.calls).toHaveLength(0);
    },
  );

  it.each([0, 20])(
    'preserves fixed-credit billing metadata (%s credits) without requiring usage',
    async credits => {
      server.urls['https://api.quiver.ai/v1/svgs/generations'].response = {
        type: 'json-value',
        body: { ...generateSvgResponseFixture, usage: undefined, credits },
      };
      const provider = createQuiverAI({ apiKey: 'test-api-key' });
      const result = await provider
        .image('arrow-1.1')
        .doGenerate(generateOptions);
      expect(result.usage).toBeUndefined();
      expect(result.providerMetadata?.quiverai).toEqual({
        credits,
        images: [{ index: 0, mimeType: 'image/svg+xml' }],
      });
    },
  );

  it.each([
    { reasoningEffort: 'none' },
    { attributes: { viewBox: { minX: 0, minY: 0, width: 0, height: 100 } } },
    { attributes: { viewBox: { minX: 0, minY: 0, width: 100, height: -1 } } },
  ])('rejects invalid Arrow 2 options: %j', async quiverai => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        providerOptions: { quiverai },
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });

  it('rejects vectorization batching instead of silently returning fewer outputs', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });
    await expect(
      provider.image('arrow-2').doGenerate({
        ...generateOptions,
        n: 2,
        files: [{ type: 'url', url: 'https://example.com/logo.png' }],
        providerOptions: { quiverai: { operation: 'vectorize' } },
      }),
    ).rejects.toThrow('Set maxImagesPerCall to 1');
    expect(server.calls).toHaveLength(0);
  });

  it('fails fast when vectorize is requested without an input image', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    await expect(
      provider.image('arrow-1').doGenerate({
        ...generateOptions,
        prompt: undefined,
        providerOptions: { quiverai: { operation: 'vectorize' } },
      }),
    ).rejects.toBeInstanceOf(InvalidArgumentError);
  });

  it('warns on unsupported call options', async () => {
    const provider = createQuiverAI({ apiKey: 'test-api-key' });

    const result = await provider.image('arrow-1').doGenerate({
      ...generateOptions,
      size: '1024x1024',
      aspectRatio: '1:1',
      seed: 42,
    });

    expect(result.warnings).toMatchObject([
      { type: 'unsupported', feature: 'size' },
      { type: 'unsupported', feature: 'aspectRatio' },
      { type: 'unsupported', feature: 'seed' },
    ]);
  });
});

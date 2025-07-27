import { vertex as vertexNode } from '@ai-sdk/google-vertex';
import { vertex as vertexEdge } from '@ai-sdk/google-vertex/edge';
import { ImageModelV2, LanguageModelV2 } from '@ai-sdk/provider';
import { APICallError, experimental_generateImage as generateImage } from 'ai';
import 'dotenv/config';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createImageModelWithCapabilities,
  createLanguageModelWithCapabilities,
  defaultChatModelCapabilities,
  ModelWithCapabilities,
} from './feature-test-suite';
import { wrapLanguageModel } from 'ai';
import { defaultSettingsMiddleware } from 'ai';

const RUNTIME_VARIANTS = {
  edge: {
    name: 'Edge Runtime',
    vertex: vertexEdge,
  },
  node: {
    name: 'Node Runtime',
    vertex: vertexNode,
  },
} as const;

const createBaseModel = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
): ModelWithCapabilities<LanguageModelV2> =>
  createLanguageModelWithCapabilities(vertex(modelId), [
    ...defaultChatModelCapabilities,
    'audioInput',
  ]);

const createSearchGroundedModel = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
): ModelWithCapabilities<LanguageModelV2> => ({
  model: wrapLanguageModel({
    model: vertex(modelId),
    middleware: defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          google: {
            useSearchGrounding: true,
          },
        },
      },
    }),
  }),
  capabilities: [...defaultChatModelCapabilities, 'searchGrounding'],
});

const createModelObject = (
  imageModel: ImageModelV2,
): { model: ImageModelV2; modelId: string } => ({
  model: imageModel,
  modelId: imageModel.modelId,
});

const createImageModel = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
  additionalTests: ((model: ImageModelV2) => void)[] = [],
): ModelWithCapabilities<ImageModelV2> => {
  const model = vertex.image(modelId);

  if (additionalTests.length > 0) {
    describe.each([createModelObject(model)])(
      'Provider-specific tests: $modelId',
      ({ model }) => {
        additionalTests.forEach(test => test(model));
      },
    );
  }
  return createImageModelWithCapabilities(model);
};

const createModelVariants = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
): ModelWithCapabilities<LanguageModelV2>[] => [
  createBaseModel(vertex, modelId),
  createSearchGroundedModel(vertex, modelId),
];

const createModelsForRuntime = (
  vertex: typeof vertexNode | typeof vertexEdge,
) => ({
  invalidModel: vertex('no-such-model'),
  languageModels: [
    ...createModelVariants(vertex, 'gemini-2.0-flash-exp'),
    ...createModelVariants(vertex, 'gemini-1.5-flash'),
    // Gemini 2.0 and Pro models have low quota limits and may require billing enabled.
    // ...createModelVariants(vertex, 'gemini-1.5-pro-001'),
    // ...createModelVariants(vertex, 'gemini-1.0-pro-001'),
  ],
  embeddingModels: [
    createEmbeddingModelWithCapabilities(
      vertex.textEmbeddingModel('textembedding-gecko'),
    ),
    createEmbeddingModelWithCapabilities(
      vertex.textEmbeddingModel('textembedding-gecko-multilingual'),
    ),
  ],
  imageModels: [
    createImageModel(vertex, 'imagen-3.0-fast-generate-001', [imageTest]),
    createImageModel(vertex, 'imagen-3.0-generate-002', [imageTest]),
  ],
});

describe.each(Object.values(RUNTIME_VARIANTS))(
  'Google Vertex AI - $name',
  ({ vertex }) => {
    createFeatureTestSuite({
      name: `Google Vertex AI (${vertex.name})`,
      models: createModelsForRuntime(vertex),
      timeout: 20000,
      customAssertions: {
        skipUsage: false,
        errorValidator: (error: APICallError) => {
          expect(error.message).toMatch(/Model .* not found/);
        },
      },
    })();
  },
);

const mediaTypeSignatures = [
  { mediaType: 'image/gif' as const, bytes: [0x47, 0x49, 0x46] },
  { mediaType: 'image/png' as const, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mediaType: 'image/jpeg' as const, bytes: [0xff, 0xd8] },
  { mediaType: 'image/webp' as const, bytes: [0x52, 0x49, 0x46, 0x46] },
];

function detectImageMediaType(
  image: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | undefined {
  for (const { bytes, mediaType } of mediaTypeSignatures) {
    if (
      image.length >= bytes.length &&
      bytes.every((byte, index) => image[index] === byte)
    ) {
      return mediaType;
    }
  }

  return undefined;
}

const imageTest = (model: ImageModelV2) => {
  vi.setConfig({ testTimeout: 10000 });

  it('should generate an image with correct dimensions and format', async () => {
    const { image } = await generateImage({
      model,
      prompt: 'A burrito launched through a tunnel',
      providerOptions: {
        vertex: {
          aspectRatio: '3:4',
        },
      },
    });

    // Verify we got a Uint8Array back
    expect(image.uint8Array).toBeInstanceOf(Uint8Array);

    // Check the file size is reasonable (at least 10KB, less than 10MB)
    expect(image.uint8Array.length).toBeGreaterThan(10 * 1024);
    expect(image.uint8Array.length).toBeLessThan(10 * 1024 * 1024);

    // Verify PNG format
    const mediaType = detectImageMediaType(image.uint8Array);
    expect(mediaType).toBe('image/png');

    // Create a temporary buffer to verify image dimensions
    const tempBuffer = Buffer.from(image.uint8Array);

    // PNG dimensions are stored at bytes 16-24
    const width = tempBuffer.readUInt32BE(16);
    const height = tempBuffer.readUInt32BE(20);

    // https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images#performance-limits
    expect(width).toBe(896);
    expect(height).toBe(1280);
  });
};

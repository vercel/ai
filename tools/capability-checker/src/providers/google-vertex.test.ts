import { describe, expect, it, vi } from 'vitest';
import { vertex as vertexEdge } from '@ai-sdk/google-vertex/edge';
import { vertex as vertexNode } from '@ai-sdk/google-vertex';
import {
  APICallError,
  LanguageModelV1,
  experimental_generateImage as generateImage,
} from 'ai';
import {
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createImageModelWithCapabilities,
  createLanguageModelWithCapabilities,
  defaultChatModelCapabilities,
} from '../feature-test-suite';
import { ImageModelV1 } from '@ai-sdk/provider';
import { ModelConfig, ModelWithCapabilities } from '../types/model';
import 'dotenv/config';

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
): ModelWithCapabilities<LanguageModelV1> =>
  createLanguageModelWithCapabilities(vertex(modelId), [
    ...defaultChatModelCapabilities,
    'audioInput',
  ]);

const createSearchGroundedModel = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
): ModelWithCapabilities<LanguageModelV1> => ({
  model: vertex(modelId, {
    useSearchGrounding: true,
  }),
  capabilities: [...defaultChatModelCapabilities, 'searchGrounding'],
});

const createModelObject = (
  imageModel: ImageModelV1,
): { model: ImageModelV1; modelId: string } => ({
  model: imageModel,
  modelId: imageModel.modelId,
});

const createImageModel = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
  additionalTests: ((model: ImageModelV1) => void)[] = [],
): ModelWithCapabilities<ImageModelV1> => {
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
): ModelWithCapabilities<LanguageModelV1>[] => [
  createBaseModel(vertex, modelId),
  createSearchGroundedModel(vertex, modelId),
];

export default function runTests(modelConfig: ModelConfig) {
  describe.each(Object.values(RUNTIME_VARIANTS))(
    'Google Vertex AI - $name',
    ({ vertex }) => {
      const commonConfig = {
        name: `Google Vertex AI (${vertex.name})`,
        timeout: 20000,
      };

      switch (modelConfig.modelType) {
        case 'language':
          createFeatureTestSuite({
            ...commonConfig,
            models: {
              language: [...createModelVariants(vertex, modelConfig.modelId)],
            },
            errorValidators: {
              language: (error: APICallError) => {
                expect(error.message).toMatch(/Model .* not found/);
              },
            },
          })();
          break;

        case 'embedding':
          createFeatureTestSuite({
            ...commonConfig,
            models: {
              embedding: [
                createEmbeddingModelWithCapabilities(
                  vertex.textEmbeddingModel(modelConfig.modelId),
                ),
              ],
            },
          })();
          break;

        case 'image':
          createFeatureTestSuite({
            ...commonConfig,
            models: {
              image: [
                createImageModel(vertex, modelConfig.modelId, [imageTest]),
              ],
            },
          })();
          break;
      }
    },
  );
}

const mimeTypeSignatures = [
  { mimeType: 'image/gif' as const, bytes: [0x47, 0x49, 0x46] },
  { mimeType: 'image/png' as const, bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mimeType: 'image/jpeg' as const, bytes: [0xff, 0xd8] },
  { mimeType: 'image/webp' as const, bytes: [0x52, 0x49, 0x46, 0x46] },
];

function detectImageMimeType(
  image: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | undefined {
  for (const { bytes, mimeType } of mimeTypeSignatures) {
    if (
      image.length >= bytes.length &&
      bytes.every((byte, index) => image[index] === byte)
    ) {
      return mimeType;
    }
  }

  return undefined;
}

const imageTest = (model: ImageModelV1) => {
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
    const mimeType = detectImageMimeType(image.uint8Array);
    expect(mimeType).toBe('image/png');

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

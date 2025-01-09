import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';
import { vertex as vertexEdge } from '@ai-sdk/google-vertex/edge';
import { vertex as vertexNode } from '@ai-sdk/google-vertex';
import {
  generateText,
  experimental_generateImage as generateImage,
  APICallError,
} from 'ai';

import { createFeatureTestSuite } from './feature-test-suite';

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

const createBaseModel = (modelId: string) => ({
  model: vertexNode(modelId),
  capabilities: {},
});

const createSearchGroundedModel = (modelId: string) => ({
  model: vertexNode(modelId, {
    useSearchGrounding: true,
  }),
  capabilities: {
    searchGrounding: true,
  },
});

const createModelsForRuntime = (
  vertex: typeof vertexNode | typeof vertexEdge,
) => ({
  invalidModel: vertex('no-such-model'),
  languageModels: [
    createBaseModel('gemini-1.5-flash'),
    // createSearchGroundedModel('gemini-1.5-flash'),
    // Gemini 2.0 and Pro models have low quota limits and may require billing enabled.
    // createSearchGroundedModel('gemini-2.0-flash-exp'),
    // createSearchGroundedModel('gemini-1.5-pro-001'),
    // createSearchGroundedModel('gemini-1.0-pro-001'),
  ],
  embeddingModels: [
    {
      model: vertex.textEmbeddingModel('textembedding-gecko'),
    },
    {
      model: vertex.textEmbeddingModel('textembedding-gecko-multilingual'),
    },
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

createFeatureTestSuite({
  name: 'Google Vertex AI - Search Grounding Tests',
  models: {
    languageModels: [createSearchGroundedModel('gemini-1.5-flash')],
  },
  timeout: 20000,
  customAssertions: {
    skipUsage: false,
  },
  testTypes: ['searchGrounding'],
})();

// TODO: Restore imagen model testing.
// image: ['imagen-3.0-generate-001', 'imagen-3.0-fast-generate-001'],

// TODO: Figure out how to restore testing provider/model-specific features like below.

// describe.each(Object.values(RUNTIME_VARIANTS))(
//   'Google Vertex E2E Tests - $name',
//   ({ vertex }) => {
//     vi.setConfig({ testTimeout: LONG_TEST_MILLIS });

//     describe.each(MODEL_VARIANTS.chat)('Chat Model: %s', modelId => {
//       it(
//         'should generate text from audio input',
//         { timeout: LONG_TEST_MILLIS },
//         async () => {
//           const model = vertex(modelId);
//           const result = await generateText({
//             model,
//             messages: [
//               {
//                 role: 'user',
//                 content: [
//                   {
//                     type: 'text',
//                     text: 'Output a transcript of spoken words. Break up transcript lines when there are pauses. Include timestamps in the format of HH:MM:SS.SSS.',
//                   },
//                   {
//                     type: 'file',
//                     data: Buffer.from(fs.readFileSync('./data/galileo.mp3')),
//                     mimeType: 'audio/mpeg',
//                   },
//                 ],
//               },
//             ],
//           });
//           expect(result.text).toBeTruthy();
//           expect(result.text.toLowerCase()).toContain('galileo');
//           expect(result.usage?.totalTokens).toBeGreaterThan(0);
//         },
//       );
//     });

//     describe.each(MODEL_VARIANTS.image)('Image Model: %s', modelId => {
//       it('should generate an image with correct dimensions and format', async () => {
//         const model = vertex.image(modelId);
//         const { image } = await generateImage({
//           model,
//           prompt: 'A burrito launched through a tunnel',
//           providerOptions: {
//             vertex: {
//               aspectRatio: '3:4',
//             },
//           },
//         });

//         // Verify we got a Uint8Array back
//         expect(image.uint8Array).toBeInstanceOf(Uint8Array);

//         // Check the file size is reasonable (at least 10KB, less than 10MB)
//         expect(image.uint8Array.length).toBeGreaterThan(10 * 1024);
//         expect(image.uint8Array.length).toBeLessThan(10 * 1024 * 1024);

//         // Verify PNG format
//         const mimeType = detectImageMimeType(image.uint8Array);
//         expect(mimeType).toBe('image/png');

//         // Create a temporary buffer to verify image dimensions
//         const tempBuffer = Buffer.from(image.uint8Array);

//         // PNG dimensions are stored at bytes 16-24
//         const width = tempBuffer.readUInt32BE(16);
//         const height = tempBuffer.readUInt32BE(20);

//         // https://cloud.google.com/vertex-ai/generative-ai/docs/image/generate-images#performance-limits
//         expect(width).toBe(896);
//         expect(height).toBe(1280);
//       });
//     });
//   },
// );

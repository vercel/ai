import { googleVertex as vertexNode } from '@ai-sdk/google-vertex';
import { googleVertex as vertexEdge } from '@ai-sdk/google-vertex/edge';
import {
  defaultSettingsMiddleware,
  wrapLanguageModel,
  type APICallError,
} from 'ai';
import 'dotenv/config';
import { describe, expect } from 'vitest';
import {
  createEmbeddingModelWithCapabilities,
  createFeatureTestSuite,
  createImageModelWithCapabilities,
  createLanguageModelWithCapabilities,
  defaultChatModelCapabilities,
  type ModelCapabilities,
} from './feature-test-suite';
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
) =>
  createLanguageModelWithCapabilities(vertex(modelId), [
    ...defaultChatModelCapabilities,
    'audioInput',
  ]);

const createSearchGroundedModel = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
) => ({
  model: wrapLanguageModel({
    model: vertex(modelId),
    middleware: defaultSettingsMiddleware({
      settings: {
        tools: [
          {
            type: 'provider',
            id: 'google.google_search',
            name: 'google_search',
            args: {},
          },
        ],
      },
    }),
  }),
  capabilities: [
    ...defaultChatModelCapabilities,
    'searchGrounding',
  ] as ModelCapabilities,
});

const createModelVariants = (
  vertex: typeof vertexNode | typeof vertexEdge,
  modelId: string,
) => [
  createBaseModel(vertex, modelId),
  createSearchGroundedModel(vertex, modelId),
];

const createModelsForRuntime = (
  vertex: typeof vertexNode | typeof vertexEdge,
) => ({
  invalidModel: vertex('no-such-model'),
  languageModels: [
    ...createModelVariants(vertex, 'gemini-2.5-flash-image'),
    ...createModelVariants(vertex, 'gemini-2.5-flash'),
  ],
  embeddingModels: [
    createEmbeddingModelWithCapabilities(
      vertex.embeddingModel('textembedding-gecko'),
    ),
    createEmbeddingModelWithCapabilities(
      vertex.embeddingModel('textembedding-gecko-multilingual'),
    ),
  ],
  imageModels: [
    createImageModelWithCapabilities(vertex.image('gemini-2.5-flash-image')),
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

import { describe, vi, afterEach, beforeAll } from 'vitest';
import type {
  EmbeddingModelV1,
  ImageModelV1,
  LanguageModelV1,
} from '@ai-sdk/provider';
import { capabilityTests, TestFunction } from './capabilities';
import {
  FeatureTestContext,
  TestFunctionParams,
  TestSuiteOptions,
} from './types/testing';
import { CapabilityModelType, ModelCapabilities } from './types/capability';
import { ModelWithCapabilities } from './types/model';
import { ModelTypeMap } from './types/capability';

export const defaultChatModelCapabilities: ModelCapabilities = [
  'imageInput',
  'objectGeneration',
  'pdfInput',
  'textCompletion',
  'toolCalls',
];

export const createLanguageModelWithCapabilities = (
  model: LanguageModelV1,
  capabilities: ModelCapabilities = defaultChatModelCapabilities,
): ModelWithCapabilities<LanguageModelV1> => ({
  model,
  capabilities,
});

export const createEmbeddingModelWithCapabilities = (
  model: EmbeddingModelV1<string>,
  capabilities: ModelCapabilities = ['embedding'],
): ModelWithCapabilities<EmbeddingModelV1<string>> => ({
  model,
  capabilities,
});

export const createImageModelWithCapabilities = (
  model: ImageModelV1,
  capabilities: ModelCapabilities = ['imageGeneration'],
): ModelWithCapabilities<ImageModelV1> => {
  return {
    model,
    capabilities,
  };
};

const createModelObjects = <T extends { modelId: string }>(
  models: ModelWithCapabilities<T>[] | undefined,
) =>
  models?.map(({ model, capabilities }) => ({
    modelId: model.modelId,
    model,
    capabilities,
  })) || [];

export function createFeatureTestSuite({
  name,
  models,
  errorValidators,
  timeout = 10000,
}: TestSuiteOptions) {
  return () => {
    describe(`${name} Feature Test Suite`, () => {
      vi.setConfig({ testTimeout: timeout });

      let suiteContext: FeatureTestContext;

      beforeAll(() => {
        suiteContext = {
          capability: null,
          testResult: null,
        };
      });

      afterEach(context => {
        if (!('task' in context)) return;

        const capability = suiteContext.capability;
        const testResult = suiteContext.testResult;

        if (capability && context.task.result?.state) {
          const testPassed = context.task.result.state === 'pass';

          if (testResult) {
            testResult.capabilities[capability] = {
              supported: testPassed,
              error: testPassed
                ? undefined
                : context.task.result?.errors?.[0]?.message,
            };
          }
        }
      });

      describe.each(createModelObjects(models.language))(
        'Language Model: $modelId',
        ({ model, capabilities }) => {
          Object.entries(capabilityTests).forEach(([capability, test]) => {
            const typedCapability = capability as keyof CapabilityModelType;
            if (capabilities?.includes(typedCapability)) {
              runCapabilityTest<typeof typedCapability>(
                typedCapability,
                test as { run: TestFunction<typeof typedCapability> },
                {
                  model:
                    model as ModelTypeMap[CapabilityModelType[typeof typedCapability]],
                  capabilities,
                  errorValidators,
                  type: 'language' as CapabilityModelType[typeof typedCapability],
                },
              );
            }
          });
        },
      );

      if (models.embedding && models.embedding.length > 0) {
        describe.each(createModelObjects(models.embedding))(
          'Embedding Model: $modelId',
          ({ model, capabilities }) => {
            if (capabilities?.includes('embedding')) {
              capabilityTests.embedding.run({
                model,
                capabilities,
                type: 'embedding' as const,
                errorValidators,
              });
            }
          },
        );
      }

      if (models.image && models.image.length > 0) {
        describe.each(createModelObjects(models.image))(
          'Image Model: $modelId',
          ({ model, capabilities }) => {
            if (capabilities?.includes('imageGeneration')) {
              capabilityTests.imageGeneration.run({
                model,
                capabilities,
                type: 'image' as const,
                errorValidators,
              });
            } else if (capabilities?.includes('imageModelErrorHandling')) {
              capabilityTests.imageModelErrorHandling.run({
                model,
                capabilities,
                type: 'image' as const,
                errorValidators,
              });
            }
          },
        );
      }
    });
  };
}

function runCapabilityTest<K extends keyof CapabilityModelType>(
  capability: K,
  test: { run: TestFunction<K> },
  params: TestFunctionParams<ModelTypeMap[CapabilityModelType[K]]> & {
    type: CapabilityModelType[K];
    model: ModelTypeMap[CapabilityModelType[K]];
  },
) {
  test.run(params);
}

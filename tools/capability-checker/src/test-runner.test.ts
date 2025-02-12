import { describe, beforeAll, afterAll, afterEach } from 'vitest';
import type { ModelConfig } from './types/model';
import { loadCapabilities, groupModelsByProvider } from './test-config';
import { TestResultStore } from './test-result-store';
import path from 'path';
import { TestResult } from './types/test-result';
import { Capability } from './types/capability';
import { capabilityTests } from './capabilities';
import type { FeatureTestContext } from './types/testing';

const CAPABILITIES = Object.keys(capabilityTests) as Capability[];

describe('Dynamic Provider Compatibility Tests', () => {
  const resultStore = new TestResultStore();
  const allCapabilities = loadCapabilities();
  const modelsByProvider = groupModelsByProvider(
    allCapabilities.models as ModelConfig[],
  );

  beforeAll(async () => {
    await resultStore.initializeOutputDir();
  });

  afterAll(async () => {
    await resultStore.writeMetadata(allCapabilities.models.length);
  });

  for (const [provider, modelTypes] of Object.entries(modelsByProvider)) {
    describe(`Provider: ${provider}`, async () => {
      const testModule = await import(
        path.join(__dirname, 'providers', `${provider}.test.ts`)
      );

      if (typeof testModule.default !== 'function') {
        throw new Error(`No default function found for provider ${provider}`);
      }

      for (const [modelType, models] of Object.entries(modelTypes)) {
        if (models.length === 0) continue;

        describe(`${modelType} models`, () => {
          for (const modelConfig of models) {
            describe(`${modelConfig.modelId}${
              modelConfig.variant ? ` (${modelConfig.variant})` : ''
            }`, () => {
              const ctx = {
                capability: null as Capability | null,
                testResult: null as TestResult | null,
              } satisfies FeatureTestContext;

              beforeAll(() => {
                ctx.testResult = {
                  provider: modelConfig.provider,
                  modelType: modelConfig.modelType,
                  modelId: modelConfig.modelId,
                  variant: modelConfig.variant,
                  timestamp: new Date().toISOString(),
                  capabilities: Object.fromEntries(
                    CAPABILITIES.map((cap: Capability) => [
                      cap,
                      { supported: false },
                    ]),
                  ) as Record<Capability, { supported: boolean }>,
                };
              });

              afterEach(context => {
                const capability = context.task.meta?.capability as Capability;
                if (context.task.result?.state === 'pass' && capability) {
                  ctx.testResult!.capabilities[capability] = {
                    supported: true,
                  };
                }
              });

              afterAll(async () => {
                await resultStore.writeModelResult(
                  modelConfig.provider,
                  modelConfig.modelType,
                  modelConfig.modelId,
                  modelConfig.variant,
                  ctx.testResult!,
                );
                ctx.testResult = null;
                ctx.capability = null;
              });

              testModule.default(modelConfig, ctx);
            });
          }
        });
      }
    });
  }
});

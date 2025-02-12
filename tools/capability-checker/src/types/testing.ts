import type { APICallError } from 'ai';
import type { ModelVariants } from './model';
import type { Capability, ModelCapabilities } from './capability';
import type { TestResult } from './test-result';
import type {
  LanguageModelV1,
  ImageModelV1,
  EmbeddingModelV1,
} from '@ai-sdk/provider';

declare module 'vitest' {
  interface TaskMeta {
    capability?: Capability | null;
    testResult?: TestResult | null;
  }
}

export type ErrorValidators = {
  language?: (error: APICallError) => void;
  image?: (error: APICallError) => void;
  embedding?: (error: APICallError) => void;
};

export interface ProviderTestConfig {
  name: string;
  timeout?: number;
  skipUsage?: boolean;
  errorValidators?: ErrorValidators;
  models?: ModelVariants;
}

export interface TestSuiteOptions {
  name: string;
  models: ModelVariants;
  timeout?: number;
  errorValidators?: ErrorValidators;
  skipUsage?: boolean;
}

export interface TestFunctionParams<
  T = LanguageModelV1 | ImageModelV1 | EmbeddingModelV1<string>,
> {
  model: T;
  capabilities: ModelCapabilities;
  errorValidators?: ErrorValidators;
  skipUsage?: boolean;
}

export interface FeatureTestContext {
  capability: Capability | null;
  testResult: TestResult | null;
}

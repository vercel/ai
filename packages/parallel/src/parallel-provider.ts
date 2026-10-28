import {
  NoSuchModelError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { ParallelDecisionModel } from './parallel-decision-model';
import type { ParallelDecisionModelId } from './parallel-decision-model-options';
import { VERSION } from './version';

export interface ParallelProvider extends ProviderV4 {
  /** Creates a web-grounded decision model. */
  decisionModel(modelId: ParallelDecisionModelId): DecisionModelV4;
}

export interface ParallelProviderSettings {
  /** API key. Defaults to the PARALLEL_API_KEY environment variable. */
  apiKey?: string;
  /** API base URL. Defaults to https://api.parallel.ai/v1. */
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export function createParallel(
  options: ParallelProviderSettings = {},
): ParallelProvider {
  const headers = () =>
    withUserAgentSuffix(
      {
        'x-api-key': loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'PARALLEL_API_KEY',
          description: 'Parallel',
        }),
        ...options.headers,
      },
      `ai-sdk-parallel/${VERSION}`,
    );

  return {
    specificationVersion: 'v4',
    decisionModel: modelId => {
      if (modelId.length === 0) {
        throw new NoSuchModelError({ modelId, modelType: 'decisionModel' });
      }
      return new ParallelDecisionModel(modelId, {
        provider: 'parallel.decision',
        baseURL:
          withoutTrailingSlash(options.baseURL) ?? 'https://api.parallel.ai/v1',
        headers,
        fetch: options.fetch,
      });
    },
    languageModel: modelId => {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    embeddingModel: modelId => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: modelId => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  };
}

export const parallel = createParallel();

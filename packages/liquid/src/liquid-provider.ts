import {
  NoSuchModelError,
  type ProviderV4,
  type Experimental_DecisionModelV4 as DecisionModelV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  resolveWith,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { DecisionLiquidModel } from './liquid-decision-model';
import type { LiquidDecisionModelId } from './liquid-decision-model-options';
import { VERSION } from './version';

export interface LiquidProviderSettings {
  /** API key. Defaults to the LIQUID_API_KEY environment variable. */
  apiKey?: Resolvable<string>;
  /** API URL prefix. Defaults to https://api.liquid.ai. */
  baseURL?: string;
  /** Additional headers to include in requests. */
  headers?: Record<string, string>;
  /** Custom fetch implementation. */
  fetch?: FetchFunction;
}

export interface LiquidProvider extends ProviderV4 {
  /** Creates an experimental decision model using the Liquid Decisions API. */
  decisionModel(modelId: LiquidDecisionModelId): DecisionModelV4;
}

export function createLiquid(
  options: LiquidProviderSettings = {},
): LiquidProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? 'https://api.liquid.ai') ??
    'https://api.liquid.ai';
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({
            apiKey,
            environmentVariableName: 'LIQUID_API_KEY',
            description: 'Liquid',
          })}`,
          ...options.headers,
        },
        `ai-sdk-liquid/${VERSION}`,
      ),
    );

  return {
    specificationVersion: 'v4',
    decisionModel: (modelId: LiquidDecisionModelId) =>
      new DecisionLiquidModel(modelId, {
        provider: 'liquid.decision',
        baseURL,
        headers: getHeaders,
        fetch: options.fetch,
      }),
    languageModel(modelId) {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    },
    imageModel(modelId) {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
    embeddingModel(modelId) {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
  };
}

export const liquid = createLiquid();

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
import {
  DecisionLiquidModel,
  type LiquidDecisionModelId,
} from './liquid-decision-model';
import { VERSION } from './version';

export interface LiquidProvider extends ProviderV4 {
  decisionModel(modelId: LiquidDecisionModelId): DecisionModelV4;
  /** @deprecated Use `decisionModel` instead. */
  evaluationModel(modelId: LiquidDecisionModelId): DecisionModelV4 & {
    doEvaluate: DecisionModelV4['doDecide'];
  };
}

export interface LiquidProviderSettings {
  /** API key. Defaults to the LIQUID_API_KEY environment variable. */
  apiKey?: string;
  /** API base URL. Defaults to https://api.liquid.ai/decisions/v1. */
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export function createLiquid(
  options: LiquidProviderSettings = {},
): LiquidProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://api.liquid.ai/decisions/v1';
  const headers = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({ apiKey: options.apiKey, environmentVariableName: 'LIQUID_API_KEY', description: 'Liquid' })}`,
        ...options.headers,
      },
      `ai-sdk-liquid/${VERSION}`,
    );

  const decisionModel = (modelId: LiquidDecisionModelId) =>
    new DecisionLiquidModel(modelId, {
      provider: 'liquid.decision',
      baseURL,
      headers,
      fetch: options.fetch,
    });

  return {
    specificationVersion: 'v4',
    decisionModel,
    evaluationModel: decisionModel,
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

export const liquid = createLiquid();

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
  DecisionTypeSafeAiModel,
  type TypeSafeAiDecisionModelId,
} from './typesafe-ai-decision-model';
import { VERSION } from './version';

/** TypeSafe's experimental decision capability, isolated from ProviderV4. */
export interface TypeSafeAiProvider extends ProviderV4 {
  decisionModel(modelId: TypeSafeAiDecisionModelId): DecisionModelV4;
  /** @deprecated Use `decisionModel` instead. */
  evaluationModel(modelId: TypeSafeAiDecisionModelId): DecisionModelV4 & {
    doEvaluate: DecisionModelV4['doDecide'];
  };
}

export interface TypeSafeAiProviderSettings {
  /** API key. Defaults to the TYPESAFE_AI_API_KEY environment variable. */
  apiKey?: string;
  /** API base URL. Defaults to https://api.typesafe.ai/v1. */
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export function createTypeSafeAi(
  options: TypeSafeAiProviderSettings = {},
): TypeSafeAiProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ?? 'https://api.typesafe.ai/v1';
  const headers = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({ apiKey: options.apiKey, environmentVariableName: 'TYPESAFE_AI_API_KEY', description: 'TypeSafe' })}`,
        ...options.headers,
      },
      `ai-sdk-typesafe-ai/${VERSION}`,
    );

  const decisionModel = (modelId: TypeSafeAiDecisionModelId) =>
    new DecisionTypeSafeAiModel(modelId, {
      provider: 'typesafe.decision',
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

export const typeSafeAi = createTypeSafeAi();

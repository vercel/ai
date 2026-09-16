import {
  NoSuchModelError,
  type Experimental_EvaluationModelV4 as EvaluationModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import {
  EvaluationTypeSafeAiModel,
  type TypeSafeAiEvaluationModelId,
} from './typesafe-ai-evaluation-model';
import { VERSION } from './version';

/** TypeSafe's experimental evaluation capability, isolated from ProviderV4. */
export interface TypeSafeAiProvider extends ProviderV4 {
  evaluationModel(modelId: TypeSafeAiEvaluationModelId): EvaluationModelV4;
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
      `ai-sdk/typesafe-ai/${VERSION}`,
    );

  return {
    specificationVersion: 'v4',
    evaluationModel: modelId =>
      new EvaluationTypeSafeAiModel(modelId, {
        provider: 'typesafe.evaluation',
        baseURL,
        headers,
        fetch: options.fetch,
      }),
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

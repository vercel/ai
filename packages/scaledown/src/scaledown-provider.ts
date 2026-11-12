import {
  NoSuchModelError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  resolveWith,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import {
  DecisionScaleDownModel,
  type ScaleDownDecisionModelId,
} from './scaledown-decision-model';
import { VERSION } from './version';

export interface ScaleDownProvider extends ProviderV4 {
  /** Creates a model for ScaleDown's experimental Decisions API. */
  decisionModel(modelId: ScaleDownDecisionModelId): DecisionModelV4;
}

export interface ScaleDownProviderSettings {
  /** API key. Defaults to the SCALEDOWN_API_KEY environment variable. */
  apiKey?: Resolvable<string>;
  /** API base URL. Defaults to https://api.scaledown.xyz. */
  baseURL?: string;
  headers?: Record<string, string>;
  fetch?: FetchFunction;
}

export function createScaleDown(
  options: ScaleDownProviderSettings = {},
): ScaleDownProvider {
  const headers = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          'x-api-key': loadApiKey({
            apiKey,
            environmentVariableName: 'SCALEDOWN_API_KEY',
            description: 'ScaleDown',
          }),
          ...options.headers,
        },
        `ai-sdk-scaledown/${VERSION}`,
      ),
    );

  return {
    specificationVersion: 'v4',
    decisionModel: modelId =>
      new DecisionScaleDownModel(modelId, {
        provider: 'scaledown.decision',
        baseURL:
          withoutTrailingSlash(options.baseURL) ?? 'https://api.scaledown.xyz',
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

export const scaledown = createScaleDown();
export const scaleDown = scaledown;

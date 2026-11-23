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
import { DecisionHumeModel } from './hume-decision-model';
import type { HumeDecisionModelId } from './hume-decision-model-options';
import { VERSION } from './version';

export interface HumeProvider extends ProviderV4 {
  /** Creates an experimental decision model using the Hume Audio Decisions API. */
  decisionModel(modelId: HumeDecisionModelId): DecisionModelV4;
}

export interface HumeProviderSettings {
  /**
   * API key for authenticating requests. May be a string, promise, or a
   * synchronous/asynchronous callback called before each request.
   * Defaults to the HUME_API_KEY environment variable.
   */
  apiKey?: Resolvable<string>;

  /**
   * API URL prefix. Defaults to https://api.cloud.hume.ai.
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

/**
 * Create an Hume provider instance.
 */
export function createHume(options: HumeProviderSettings = {}): HumeProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? 'https://api.cloud.hume.ai') ??
    'https://api.cloud.hume.ai';
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          'X-Hume-Api-Key': loadApiKey({
            apiKey,
            environmentVariableName: 'HUME_API_KEY',
            description: 'Hume',
          }),
          ...options.headers,
        },
        `ai-sdk-hume/${VERSION}`,
      ),
    );

  return {
    specificationVersion: 'v4',
    decisionModel: (modelId: HumeDecisionModelId) =>
      new DecisionHumeModel(modelId, {
        provider: 'hume.decision',
        baseURL,
        headers: getHeaders,
        fetch: options.fetch,
      }),
    languageModel(modelId) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
        message: 'Hume does not provide language models',
      });
    },
    embeddingModel(modelId) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'embeddingModel',
        message: 'Hume does not provide embedding models',
      });
    },
    imageModel(modelId) {
      throw new NoSuchModelError({
        modelId,
        modelType: 'imageModel',
        message: 'Hume does not provide image models',
      });
    },
  };
}

/**
 * Default Hume provider instance.
 */
export const hume = createHume();

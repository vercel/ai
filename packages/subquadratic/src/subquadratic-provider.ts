import {
  NoSuchModelError,
  type Experimental_DecisionModelV4 as DecisionModelV4,
  type LanguageModelV4,
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
import { SubquadraticChatLanguageModel } from './subquadratic-chat-language-model';
import type { SubquadraticChatModelId } from './subquadratic-chat-options';
import { DecisionSubquadraticModel } from './subquadratic-decision-model';
import type { SubquadraticDecisionModelId } from './subquadratic-decision-model-options';
import { VERSION } from './version';

export interface SubquadraticProviderSettings {
  /**
   * SubQ API key. Default value is taken from the `SUBQUADRATIC_API_KEY`
   * environment variable.
   * A function is called before each request and may return a promise.
   */
  apiKey?: Resolvable<string>;

  /**
   * Base URL for the API calls. Default: 'https://api.subq.ai/v1'
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

export interface SubquadraticProvider extends ProviderV4 {
  /**
   * Creates a chat model for text generation.
   */
  (modelId: SubquadraticChatModelId): LanguageModelV4;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId: SubquadraticChatModelId): LanguageModelV4;

  /**
   * Creates a language model for text generation. Alias for chatModel.
   */
  languageModel(modelId: SubquadraticChatModelId): LanguageModelV4;

  /**
   * Creates an experimental decision model using the SubQ Decisions API.
   */
  decisionModel(modelId: SubquadraticDecisionModelId): DecisionModelV4;
}

const defaultBaseURL = 'https://api.subq.ai/v1';

export function createSubquadratic(
  options: SubquadraticProviderSettings = {},
): SubquadraticProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL ?? defaultBaseURL) ?? defaultBaseURL;
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({
            apiKey,
            environmentVariableName: 'SUBQUADRATIC_API_KEY',
            description: 'SubQ API key',
          })}`,
          ...options.headers,
        },
        `ai-sdk-subquadratic/${VERSION}`,
      ),
    );

  const createChatModel = (modelId: SubquadraticChatModelId) =>
    new SubquadraticChatLanguageModel(modelId, {
      provider: 'subquadratic.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: SubquadraticChatModelId) =>
    createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.chatModel = createChatModel;
  provider.languageModel = createChatModel;
  provider.decisionModel = (modelId: SubquadraticDecisionModelId) =>
    new DecisionSubquadraticModel(modelId, {
      provider: 'subquadratic.decision',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  return provider;
}

export const subquadratic = createSubquadratic();

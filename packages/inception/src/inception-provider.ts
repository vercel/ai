import {
  NoSuchModelError,
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
import { InceptionChatLanguageModel } from './chat/inception-chat-language-model';
import type { InceptionChatModelId } from './chat/inception-chat-language-model-options';
import { VERSION } from './version';

export interface InceptionProvider extends ProviderV4 {
  (modelId: InceptionChatModelId): LanguageModelV4;
  languageModel(modelId: InceptionChatModelId): LanguageModelV4;
  chat(modelId: InceptionChatModelId): LanguageModelV4;
}

export interface InceptionProviderSettings {
  /** Inception API key. Defaults to INCEPTION_API_KEY. */
  apiKey?: Resolvable<string>;
  /** URL prefix for API calls. Defaults to https://api.inceptionlabs.ai/v1. */
  baseURL?: string;
  /** Custom headers to include in requests. */
  headers?: Record<string, string>;
  /** Custom fetch implementation. */
  fetch?: FetchFunction;
}

export function createInception(
  options: InceptionProviderSettings = {},
): InceptionProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.inceptionlabs.ai/v1',
  );
  const getHeaders = () =>
    resolveWith(options.apiKey, apiKey =>
      withUserAgentSuffix(
        {
          Authorization: `Bearer ${loadApiKey({
            apiKey,
            environmentVariableName: 'INCEPTION_API_KEY',
            description: 'Inception API key',
          })}`,
          ...options.headers,
        },
        `ai-sdk-inception/${VERSION}`,
      ),
    );

  const createChatModel = (modelId: InceptionChatModelId) =>
    new InceptionChatLanguageModel(modelId, {
      provider: 'inception.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: InceptionChatModelId) => createChatModel(modelId);
  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const inception = createInception();

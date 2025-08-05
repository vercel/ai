import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV2,
  NoSuchModelError,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { HuggingFaceChatModelId } from './huggingface-chat-options';

export interface HuggingFaceProviderSettings {
  /**
Hugging Face API key.
*/
  apiKey?: string;
  /**
Base URL for the API calls.
*/
  baseURL?: string;
  /**
Custom headers to include in the requests.
*/
  headers?: Record<string, string>;
  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
*/
  fetch?: FetchFunction;
}

export interface HuggingFaceProvider extends ProviderV2 {
  /**
Creates a model for text generation.
*/
  (modelId: HuggingFaceChatModelId): LanguageModelV2;

  /**
Creates a Hugging Face model for text generation.
*/
  languageModel(modelId: HuggingFaceChatModelId): LanguageModelV2;

  /**
Creates a Hugging Face chat model for text generation.
*/
  chat(modelId: HuggingFaceChatModelId): LanguageModelV2;
}

/**
Create a Hugging Face provider instance.
 */
export function createHuggingFace(
  options: HuggingFaceProviderSettings = {},
): HuggingFaceProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://router.huggingface.co/v1',
  );

  const getHeaders = () => ({
    Authorization: `Bearer ${loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'HF_TOKEN',
      description: 'Hugging Face',
    })}`,
    ...options.headers,
  });

  const createLanguageModel = (modelId: HuggingFaceChatModelId) => {
    return new OpenAICompatibleChatLanguageModel(modelId, {
      provider: 'huggingface.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const provider = (modelId: HuggingFaceChatModelId) =>
    createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ 
      modelId, 
      modelType: 'textEmbeddingModel',
      message: 'Hugging Face OpenAI-compatible API does not support text embeddings. Use the Hugging Face Inference API directly for embeddings.'
    });
  };

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ 
      modelId, 
      modelType: 'imageModel',
      message: 'Hugging Face OpenAI-compatible API does not support image generation. Use the Hugging Face Inference API directly for image models.'
    });
  };

  return provider;
}

/**
Default Hugging Face provider instance.
 */
export const huggingface = createHuggingFace();

import { LanguageModelV2, ProviderV2 } from '@ai-sdk/provider';
import { FetchFunction } from '@ai-sdk/provider-utils';
import { VercelChatModelId, VercelChatSettings } from './vercel-chat-settings';
export interface VercelProviderSettings {
    /**
  Vercel API key.
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
export interface VercelProvider extends ProviderV2 {
    /**
  Creates a model for text generation.
  */
    (modelId: VercelChatModelId, settings?: VercelChatSettings): LanguageModelV2;
    /**
  Creates a language model for text generation.
  */
    languageModel(modelId: VercelChatModelId, settings?: VercelChatSettings): LanguageModelV2;
    /**
  Creates a chat model for text generation.
  */
    chatModel(modelId: VercelChatModelId, settings?: VercelChatSettings): LanguageModelV2;
}
export declare function createVercel(options?: VercelProviderSettings): VercelProvider;
export declare const vercel: VercelProvider;
//# sourceMappingURL=vercel-provider.d.ts.map
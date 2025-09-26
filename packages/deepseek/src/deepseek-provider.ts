import { OpenAICompatibleChatLanguageModel } from '@ai-sdk/openai-compatible';
import {
  LanguageModelV3,
  NoSuchModelError,
  ProviderV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { DeepSeekChatModelId } from './deepseek-chat-options';
import { deepSeekMetadataExtractor } from './deepseek-metadata-extractor';
import { VERSION } from './version';

export interface DeepSeekProviderSettings {
  /**
DeepSeek API key.
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

export interface DeepSeekProvider extends ProviderV3 {
  /**
Creates a DeepSeek model for text generation.
*/
  (modelId: DeepSeekChatModelId): LanguageModelV3;

  /**
Creates a DeepSeek model for text generation.
*/
  languageModel(modelId: DeepSeekChatModelId): LanguageModelV3;

  /**
Creates a DeepSeek chat model for text generation.
*/
  chat(modelId: DeepSeekChatModelId): LanguageModelV3;
}

export function createDeepSeek(
  options: DeepSeekProviderSettings = {},
): DeepSeekProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.deepseek.com/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'DEEPSEEK_API_KEY',
          description: 'DeepSeek API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/deepseek/${VERSION}`,
    );

  class DeepSeekChatLanguageModel extends OpenAICompatibleChatLanguageModel {
    private addJsonInstruction<
      T extends Parameters<LanguageModelV2['doGenerate']>[0],
    >(opts: T): T {
      if (opts.responseFormat?.type !== 'json') return opts;

      const promptArray = Array.isArray(opts.prompt) ? opts.prompt : [];

      const hasJsonWord = promptArray.some(
        m =>
          m.role === 'user' &&
          Array.isArray(m.content) &&
          m.content.some(p => p.type === 'text' && /json/i.test(p.text ?? '')),
      );
      if (hasJsonWord) return opts;

      const instruction = 'Return ONLY a valid JSON object.';
      const adjustedPrompt = [
        ...promptArray,
        { role: 'user', content: [{ type: 'text', text: instruction }] },
      ];
      return { ...opts, prompt: adjustedPrompt } as T;
    }

    async doGenerate(options: Parameters<LanguageModelV2['doGenerate']>[0]) {
      return super.doGenerate(this.addJsonInstruction(options));
    }

    async doStream(options: Parameters<LanguageModelV2['doStream']>[0]) {
      return super.doStream(this.addJsonInstruction(options));
    }
  }

  const createLanguageModel = (modelId: DeepSeekChatModelId) => {
    return new DeepSeekChatLanguageModel(modelId, {
      provider: `deepseek.chat`,
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      metadataExtractor: deepSeekMetadataExtractor,
    });
  };

  const provider = (modelId: DeepSeekChatModelId) =>
    createLanguageModel(modelId);

  provider.languageModel = createLanguageModel;
  provider.chat = createLanguageModel;

  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };
  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  return provider;
}

export const deepseek = createDeepSeek();

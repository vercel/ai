import {
  type Experimental_VideoModelV3,
  type LanguageModelV3,
  NoSuchModelError,
  type ProviderV3,
} from '@ai-sdk/provider';
import {
  createJsonErrorResponseHandler,
  type FetchFunction,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { AlibabaLanguageModel } from './alibaba-chat-language-model';
import type { AlibabaChatModelId } from './alibaba-chat-options';
import { AlibabaVideoModel } from './alibaba-video-model';
import type { AlibabaVideoModelId } from './alibaba-video-settings';
import { VERSION } from './version';

export type AlibabaErrorData = z.infer<typeof alibabaErrorDataSchema>;

const alibabaErrorDataSchema = z.object({
  error: z.object({
    message: z.string(),
    code: z.string().nullish(),
    type: z.string().nullish(),
  }),
});

export const alibabaFailedResponseHandler = createJsonErrorResponseHandler({
  errorSchema: alibabaErrorDataSchema,
  errorToMessage: data => data.error.message,
});

export interface AlibabaProvider extends ProviderV3 {
  (modelId: AlibabaChatModelId): LanguageModelV3;

  /**
   * Creates a model for text generation.
   */
  languageModel(modelId: AlibabaChatModelId): LanguageModelV3;

  /**
   * Creates a chat model for text generation.
   */
  chatModel(modelId: AlibabaChatModelId): LanguageModelV3;

  /**
   * Creates a model for video generation.
   */
  video(modelId: AlibabaVideoModelId): Experimental_VideoModelV3;

  /**
   * Creates a model for video generation.
   */
  videoModel(modelId: AlibabaVideoModelId): Experimental_VideoModelV3;
}

export interface AlibabaProviderSettings {
  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers or regional endpoints.
   * The default prefix is `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.
   */
  baseURL?: string;

  /**
   * Use a different URL prefix for video generation API calls.
   * The video API uses the DashScope native endpoint (not the OpenAI-compatible endpoint).
   * The default prefix is `https://dashscope-intl.aliyuncs.com`.
   */
  videoBaseURL?: string;

  /**
   * API key that is being sent using the `Authorization` header.
   * It defaults to the `ALIBABA_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept requests,
   * or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;

  /**
   * Include usage information in streaming responses.
   * When enabled, token usage will be included in the final chunk.
   *
   * @default true
   */
  includeUsage?: boolean;
}

/**
 * Create an Alibaba Cloud (Qwen) provider instance.
 */
export function createAlibaba(
  options: AlibabaProviderSettings = {},
): AlibabaProvider {
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';

  const videoBaseURL =
    withoutTrailingSlash(options.videoBaseURL) ??
    'https://dashscope-intl.aliyuncs.com';

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ALIBABA_API_KEY',
          description: 'Alibaba Cloud (DashScope)',
        })}`,
        ...options.headers,
      },
      `ai-sdk/alibaba/${VERSION}`,
    );

  const createLanguageModel = (modelId: AlibabaChatModelId) =>
    new AlibabaLanguageModel(modelId, {
      provider: 'alibaba.chat',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
      includeUsage: options.includeUsage ?? true,
    });

  const createVideoModel = (modelId: AlibabaVideoModelId) =>
    new AlibabaVideoModel(modelId, {
      provider: 'alibaba.video',
      baseURL: videoBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: AlibabaChatModelId) {
    if (new.target) {
      throw new Error(
        'The Alibaba model function cannot be called with the new keyword.',
      );
    }

    return createLanguageModel(modelId);
  };

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createLanguageModel;
  provider.chatModel = createLanguageModel;
  provider.video = createVideoModel;
  provider.videoModel = createVideoModel;

  provider.imageModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };

  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };

  return provider;
}

export const alibaba = createAlibaba();

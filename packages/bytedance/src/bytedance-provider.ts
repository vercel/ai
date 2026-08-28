import {
  NoSuchModelError,
  type Experimental_VideoModelV4,
  type ImageModelV4,
  type LanguageModelV4,
  type ProviderV4,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { ByteDanceChatLanguageModel } from './bytedance-chat-language-model';
import type { ByteDanceChatModelId } from './bytedance-chat-options';
import { ByteDanceImageModel } from './bytedance-image-model';
import type { ByteDanceImageModelId } from './bytedance-image-settings';
import { ByteDanceVideoModel } from './bytedance-video-model';
import type { ByteDanceVideoModelId } from './bytedance-video-settings';
import { VERSION } from './version';

function transformByteDanceRequestBody(
  args: Record<string, any>,
): Record<string, any> {
  const { parallelToolCalls, topLogprobs, logitBias, ...restArgs } = args;

  return {
    ...restArgs,
    ...(parallelToolCalls !== undefined && {
      parallel_tool_calls: parallelToolCalls,
    }),
    ...(topLogprobs !== undefined && { top_logprobs: topLogprobs }),
    ...(logitBias !== undefined && { logit_bias: logitBias }),
  };
}

export interface ByteDanceProviderSettings {
  /**
   * ByteDance Ark API key. Default value is taken from the `ARK_API_KEY`
   * environment variable.
   */
  apiKey?: string;

  /**
   * Base URL for the API calls.
   * Default: https://ark.ap-southeast.bytepluses.com/api/v3
   */
  baseURL?: string;

  /**
   * Custom headers to include in the requests.
   */
  headers?: Record<string, string>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface ByteDanceProvider extends ProviderV4 {
  /**
   * Creates a ByteDance model for text generation.
   */
  (modelId: ByteDanceChatModelId): LanguageModelV4;

  /**
   * Creates a ByteDance chat model for text generation.
   */
  chat(modelId: ByteDanceChatModelId): LanguageModelV4;

  /**
   * Creates a ByteDance chat model for text generation.
   */
  languageModel(modelId: ByteDanceChatModelId): LanguageModelV4;

  /**
   * Creates a model for video generation.
   */
  video(modelId: ByteDanceVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a model for video generation.
   */
  videoModel(modelId: ByteDanceVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates a model for image generation.
   */
  image(modelId: ByteDanceImageModelId): ImageModelV4;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: ByteDanceImageModelId): ImageModelV4;
}

const defaultBaseURL = 'https://ark.ap-southeast.bytepluses.com/api/v3';

/**
 * Create a ByteDance provider instance.
 */
export function createByteDance(
  options: ByteDanceProviderSettings = {},
): ByteDanceProvider {
  const baseURL = withoutTrailingSlash(options.baseURL ?? defaultBaseURL);

  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'ARK_API_KEY',
          description: 'ByteDance ModelArk',
        })}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      `ai-sdk/bytedance/${VERSION}`,
    );

  const createChatModel = (modelId: ByteDanceChatModelId) =>
    new ByteDanceChatLanguageModel(modelId, {
      provider: 'bytedance.chat',
      url: ({ path }) => `${baseURL}${path}`,
      headers: getHeaders,
      fetch: options.fetch,
      supportsStructuredOutputs: true,
      transformRequestBody: transformByteDanceRequestBody,
    });

  const createVideoModel = (modelId: ByteDanceVideoModelId) =>
    new ByteDanceVideoModel(modelId, {
      provider: 'bytedance.video',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createImageModel = (modelId: ByteDanceImageModelId) =>
    new ByteDanceImageModel(modelId, {
      provider: 'bytedance.image',
      baseURL: baseURL ?? defaultBaseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = (modelId: ByteDanceChatModelId) => createChatModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.video = createVideoModel;
  provider.videoModel = createVideoModel;

  return provider;
}

/**
 * Default ByteDance provider instance.
 */
export const byteDance = createByteDance();

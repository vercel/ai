import {
  type Experimental_VideoModelV4,
  ImageModelV4,
  LanguageModelV4,
  LanguageModelV4FunctionTool,
  LanguageModelV4ProviderTool,
  LanguageModelV4ToolChoice,
  NoSuchModelError,
  ProviderV4,
  RealtimeModelV4,
  RealtimeModelV4ToolDefinition,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadApiKey,
  withoutTrailingSlash,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { XaiChatLanguageModel } from './xai-chat-language-model';
import { XaiChatModelId } from './xai-chat-options';
import { XaiImageModel } from './xai-image-model';
import { XaiImageModelId } from './xai-image-settings';
import { XaiResponsesLanguageModel } from './responses/xai-responses-language-model';
import { XaiResponsesModelId } from './responses/xai-responses-options';
import { XaiRealtimeModel } from './realtime/xai-realtime-model';
import { xaiTools } from './tool';
import { VERSION } from './version';
import { XaiVideoModel } from './xai-video-model';
import { XaiVideoModelId } from './xai-video-settings';

export interface XaiProvider extends ProviderV4 {
  (modelId: XaiResponsesModelId): LanguageModelV4;

  /**
   * Creates an Xai language model for text generation.
   */
  languageModel(modelId: XaiResponsesModelId): LanguageModelV4;

  /**
   * Creates an Xai chat model for text generation.
   */
  chat: (modelId: XaiChatModelId) => LanguageModelV4;

  /**
   * Creates an Xai responses model for text generation.
   */
  responses: (modelId: XaiResponsesModelId) => LanguageModelV4;

  /**
   * Creates an Xai image model for image generation.
   */
  image(modelId: XaiImageModelId): ImageModelV4;

  /**
   * Creates an Xai image model for image generation.
   */
  imageModel(modelId: XaiImageModelId): ImageModelV4;

  /**
   * Creates an Xai video model for video generation.
   */
  video(modelId: XaiVideoModelId): Experimental_VideoModelV4;

  /**
   * Creates an Xai video model for video generation.
   */
  videoModel(modelId: XaiVideoModelId): Experimental_VideoModelV4;

  realtime: XaiRealtimeFactory;

  /**
   * Server-side agentic tools for use with the responses API.
   */
  tools: typeof xaiTools;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(modelId: string): never;
}

export interface XaiRealtimeFactory {
  (modelId: string): RealtimeModelV4;
  getToken(options: {
    model: string;
    tools?: Array<LanguageModelV4FunctionTool | LanguageModelV4ProviderTool>;
    toolChoice?: LanguageModelV4ToolChoice;
    expiresAfterSeconds?: number;
  }): Promise<{
    token: string;
    url: string;
    expiresAt?: number;
    tools: RealtimeModelV4ToolDefinition[];
  }>;
}

export interface XaiProviderSettings {
  /**
   * Base URL for the xAI API calls.
   */
  baseURL?: string;

  /**
   * API key for authenticating requests.
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
}

export function createXai(options: XaiProviderSettings = {}): XaiProvider {
  const baseURL = withoutTrailingSlash(
    options.baseURL ?? 'https://api.x.ai/v1',
  );
  const getHeaders = () =>
    withUserAgentSuffix(
      {
        Authorization: `Bearer ${loadApiKey({
          apiKey: options.apiKey,
          environmentVariableName: 'XAI_API_KEY',
          description: 'xAI API key',
        })}`,
        ...options.headers,
      },
      `ai-sdk/xai/${VERSION}`,
    );

  const createChatLanguageModel = (modelId: XaiChatModelId) => {
    return new XaiChatLanguageModel(modelId, {
      provider: 'xai.chat',
      baseURL,
      headers: getHeaders,
      generateId,
      fetch: options.fetch,
    });
  };

  const createResponsesLanguageModel = (modelId: XaiResponsesModelId) => {
    return new XaiResponsesLanguageModel(modelId, {
      provider: 'xai.responses',
      baseURL,
      headers: getHeaders,
      generateId,
      fetch: options.fetch,
    });
  };

  const createImageModel = (modelId: XaiImageModelId) => {
    return new XaiImageModel(modelId, {
      provider: 'xai.image',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createVideoModel = (modelId: XaiVideoModelId) => {
    return new XaiVideoModel(modelId, {
      provider: 'xai.video',
      baseURL,
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const createRealtimeModel = (modelId: string) => {
    return new XaiRealtimeModel(modelId, {
      provider: 'xai.realtime',
      baseURL: baseURL ?? 'https://api.x.ai/v1',
      headers: getHeaders,
      fetch: options.fetch,
    });
  };

  const realtimeFactory = Object.assign(
    (modelId: string) => createRealtimeModel(modelId),
    {
      getToken: async (tokenOptions: {
        model: string;
        tools?: Array<
          LanguageModelV4FunctionTool | LanguageModelV4ProviderTool
        >;
        toolChoice?: LanguageModelV4ToolChoice;
        expiresAfterSeconds?: number;
      }) => {
        const model = createRealtimeModel(tokenOptions.model);
        const secret = await model.doCreateClientSecret({
          expiresAfterSeconds: tokenOptions.expiresAfterSeconds,
        });

        const realtimeTools: RealtimeModelV4ToolDefinition[] = (
          tokenOptions.tools ?? []
        )
          .filter(
            (t): t is LanguageModelV4FunctionTool => t.type === 'function',
          )
          .map(t => ({
            type: 'function' as const,
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          }));

        return {
          token: secret.token,
          url: secret.url,
          expiresAt: secret.expiresAt,
          tools: realtimeTools,
        };
      },
    },
  ) as XaiRealtimeFactory;

  const provider = (modelId: XaiResponsesModelId) =>
    createResponsesLanguageModel(modelId);

  provider.specificationVersion = 'v4' as const;
  provider.languageModel = createResponsesLanguageModel;
  provider.chat = createChatLanguageModel;
  provider.responses = createResponsesLanguageModel;
  provider.embeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.textEmbeddingModel = provider.embeddingModel;
  provider.imageModel = createImageModel;
  provider.image = createImageModel;
  provider.videoModel = createVideoModel;
  provider.video = createVideoModel;
  provider.realtime = realtimeFactory;
  provider.tools = xaiTools;

  return provider;
}

export const xai = createXai();

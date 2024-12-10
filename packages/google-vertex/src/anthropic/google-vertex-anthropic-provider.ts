import {
  LanguageModelV1,
  NoSuchModelError,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  Resolvable,
  loadOptionalSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import {
  anthropicTools,
  AnthropicMessagesLanguageModel,
  AnthropicMessagesModelId,
} from '@ai-sdk/anthropic/internal';
import {
  GoogleVertexAnthropicMessagesModelId,
  GoogleVertexAnthropicMessagesSettings,
} from './google-vertex-anthropic-messages-settings';
export interface GoogleVertexAnthropicProvider extends ProviderV1 {
  /**
Creates a model for text generation.
*/
  (
    modelId: GoogleVertexAnthropicMessagesModelId,
    settings?: GoogleVertexAnthropicMessagesSettings,
  ): LanguageModelV1;

  /**
Creates a model for text generation.
*/
  languageModel(
    modelId: GoogleVertexAnthropicMessagesModelId,
    settings?: GoogleVertexAnthropicMessagesSettings,
  ): LanguageModelV1;

  /**
Anthropic-specific computer use tool.
   */
  tools: typeof anthropicTools;
}

export interface GoogleVertexAnthropicProviderSettings {
  /**
   * Google Cloud project ID. Defaults to the value of the `GOOGLE_VERTEX_PROJECT` environment variable.
   */
  project?: string;

  /**
   * Google Cloud region. Defaults to the value of the `GOOGLE_VERTEX_LOCATION` environment variable.
   */
  location?: string;

  /**
Use a different URL prefix for API calls, e.g. to use proxy servers.
The default prefix is `https://api.anthropic.com/v1`.
   */
  baseURL?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Resolvable<Record<string, string | undefined>>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
}

/**
Create a Google Vertex Anthropic provider instance.
 */
export function createVertexAnthropic(
  options: GoogleVertexAnthropicProviderSettings = {},
): GoogleVertexAnthropicProvider {
  const location = loadOptionalSetting({
    settingValue: options.location,
    environmentVariableName: 'GOOGLE_VERTEX_LOCATION',
  });
  const project = loadOptionalSetting({
    settingValue: options.project,
    environmentVariableName: 'GOOGLE_VERTEX_PROJECT',
  });
  const baseURL =
    withoutTrailingSlash(options.baseURL) ??
    `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/anthropic/models`;

  const createChatModel = (
    modelId: GoogleVertexAnthropicMessagesModelId,
    settings: GoogleVertexAnthropicMessagesSettings = {},
  ) =>
    new AnthropicMessagesLanguageModel(
      modelId as AnthropicMessagesModelId,
      settings,
      {
        provider: 'vertex.anthropic.messages',
        baseURL,
        headers: options.headers ?? {},
        fetch: options.fetch,
        buildRequestUrl: (baseURL, isStreaming) =>
          `${baseURL}/${modelId}:${
            isStreaming ? 'streamRawPredict' : 'rawPredict'
          }`,
        transformRequestBody: args => {
          // Remove model from args and add anthropic version
          const { model, ...rest } = args;
          return {
            ...rest,
            anthropic_version: 'vertex-2023-10-16',
          };
        },
      },
    );

  const provider = function (
    modelId: GoogleVertexAnthropicMessagesModelId,
    settings?: GoogleVertexAnthropicMessagesSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Anthropic model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.messages = createChatModel;
  provider.textEmbeddingModel = (modelId: string) => {
    throw new NoSuchModelError({ modelId, modelType: 'textEmbeddingModel' });
  };

  provider.tools = anthropicTools;

  return provider as GoogleVertexAnthropicProvider;
}

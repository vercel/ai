import {
  OpenAIChatLanguageModel,
  OpenAICompletionLanguageModel,
  OpenAIEmbeddingModel,
  OpenAIImageModel,
  OpenAIResponsesLanguageModel,
  OpenAISpeechModel,
  OpenAITranscriptionModel,
} from '@ai-sdk/openai/internal';
import { DeepSeekChatLanguageModel } from '@ai-sdk/deepseek/internal';
import {
  InvalidArgumentError,
  type EmbeddingModelV2,
  type LanguageModelV2,
  type ProviderV2,
  type ImageModelV2,
  type SpeechModelV2,
  type TranscriptionModelV2,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  loadApiKey,
  loadSetting,
  normalizeHeaders,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { azureOpenaiTools } from './azure-openai-tools';
import { VERSION } from './version';

export interface AzureOpenAIProvider extends ProviderV2 {
  (deploymentId: string): LanguageModelV2;

  /**
Creates an Azure OpenAI chat model for text generation.
   */
  languageModel(deploymentId: string): LanguageModelV2;

  /**
Creates an Azure OpenAI chat model for text generation.
   */
  chat(deploymentId: string): LanguageModelV2;

  /**
Creates an Azure-hosted DeepSeek chat model for text generation.
   */
  deepseek(deploymentId: string): LanguageModelV2;

  /**
Creates an Azure OpenAI responses API model for text generation.
   */
  responses(deploymentId: string): LanguageModelV2;

  /**
Creates an Azure OpenAI completion model for text generation.
   */
  completion(deploymentId: string): LanguageModelV2;

  /**
@deprecated Use `textEmbedding` instead.
   */
  embedding(deploymentId: string): EmbeddingModelV2<string>;

  /**
   * Creates an Azure OpenAI DALL-E model for image generation.
   */
  image(deploymentId: string): ImageModelV2;

  /**
   * Creates an Azure OpenAI DALL-E model for image generation.
   */
  imageModel(deploymentId: string): ImageModelV2;

  textEmbedding(deploymentId: string): EmbeddingModelV2<string>;

  /**
Creates an Azure OpenAI model for text embeddings.
   */
  textEmbeddingModel(deploymentId: string): EmbeddingModelV2<string>;

  /**
   * Creates an Azure OpenAI model for audio transcription.
   */
  transcription(deploymentId: string): TranscriptionModelV2;

  /**
   * Creates an Azure OpenAI model for speech generation.
   */
  speech(deploymentId: string): SpeechModelV2;

  /**
   * AzureOpenAI-specific tools.
   */
  tools: typeof azureOpenaiTools;
}

export interface AzureOpenAIProviderSettings {
  /**
Name of the Azure OpenAI resource. Either this or `baseURL` can be used.

The resource name is used in the assembled URL: `https://{resourceName}.openai.azure.com/openai/v1{path}`.
     */
  resourceName?: string;

  /**
Use a different URL prefix for API calls, e.g. to use proxy servers. Either this or `resourceName` can be used.
When a baseURL is provided, the resourceName is ignored.

With a baseURL, the resolved URL is `{baseURL}/v1{path}`.
   */
  baseURL?: string;

  /**
API key for authenticating requests.
     */
  apiKey?: string;

  /**
A function that returns an access token for Microsoft Entra
(formerly known as Azure Active Directory), which will be invoked
on every request.
     */
  tokenProvider?: (() => Promise<string>) | undefined;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;

  /**
Custom api version to use. Defaults to `preview`.
    */
  apiVersion?: string;

  /**
Use deployment-based URLs for specific model types. Set to true to use legacy deployment format: 
`{baseURL}/deployments/{deploymentId}{path}?api-version={apiVersion}` instead of 
`{baseURL}/v1{path}?api-version={apiVersion}`.
   */
  useDeploymentBasedUrls?: boolean;
}

/**
Create an Azure OpenAI provider instance.
 */
export function createAzure(
  options: AzureOpenAIProviderSettings = {},
): AzureOpenAIProvider {
  const tokenProvider = options.tokenProvider;

  if (options.apiKey && tokenProvider) {
    throw new InvalidArgumentError({
      argument: 'apiKey/tokenProvider',
      message:
        'Both apiKey and tokenProvider were provided. Please use only one authentication method.',
    });
  }

  const getHeaders = () => {
    const authHeaders = tokenProvider
      ? {}
      : {
          'api-key': loadApiKey({
            apiKey: options.apiKey,
            environmentVariableName: 'AZURE_API_KEY',
            description: 'Azure OpenAI',
          }),
        };

    return withUserAgentSuffix(
      {
        ...authHeaders,
        ...options.headers,
      },
      `ai-sdk/azure/${VERSION}`,
    );
  };

  const fetch: FetchFunction | undefined = tokenProvider
    ? async (input, init) => {
        const headers = normalizeHeaders(init?.headers);

        if (headers.authorization == null) {
          headers.authorization = `Bearer ${await tokenProvider()}`;
        }

        return (options.fetch ?? globalThis.fetch)(input, {
          ...init,
          headers,
        });
      }
    : options.fetch;

  const getResourceName = () =>
    loadSetting({
      settingValue: options.resourceName,
      settingName: 'resourceName',
      environmentVariableName: 'AZURE_RESOURCE_NAME',
      description: 'Azure OpenAI resource name',
    });

  const apiVersion = options.apiVersion ?? 'v1';

  const url = ({ path, modelId }: { path: string; modelId: string }) => {
    const baseUrlPrefix =
      options.baseURL ?? `https://${getResourceName()}.openai.azure.com/openai`;

    let fullUrl: URL;
    if (options.useDeploymentBasedUrls) {
      // Use deployment-based format for compatibility with certain Azure OpenAI models
      fullUrl = new URL(`${baseUrlPrefix}/deployments/${modelId}${path}`);
    } else {
      // Use v1 API format - no deployment ID in URL
      fullUrl = new URL(`${baseUrlPrefix}/v1${path}`);
    }

    fullUrl.searchParams.set('api-version', apiVersion);
    return fullUrl.toString();
  };

  const createChatModel = (deploymentName: string) =>
    new OpenAIChatLanguageModel(deploymentName, {
      provider: 'azure.chat',
      url,
      headers: getHeaders,
      fetch,
    });

  const createCompletionModel = (modelId: string) =>
    new OpenAICompletionLanguageModel(modelId, {
      provider: 'azure.completion',
      url,
      headers: getHeaders,
      fetch,
    });

  const createEmbeddingModel = (modelId: string) =>
    new OpenAIEmbeddingModel(modelId, {
      provider: 'azure.embeddings',
      headers: getHeaders,
      url,
      fetch,
    });

  const createResponsesModel = (modelId: string) =>
    new OpenAIResponsesLanguageModel(modelId, {
      provider: 'azure.responses',
      url,
      headers: getHeaders,
      fetch,
      fileIdPrefixes: ['assistant-'],
    });

  const createDeepSeekModel = (deploymentName: string) =>
    new DeepSeekChatLanguageModel(deploymentName, {
      provider: 'azure.deepseek',
      url,
      headers: getHeaders,
      fetch,
      supportsThinking: false,
    });

  const createImageModel = (modelId: string) =>
    new OpenAIImageModel(modelId, {
      provider: 'azure.image',
      url,
      headers: getHeaders,
      fetch,
    });

  const createTranscriptionModel = (modelId: string) =>
    new OpenAITranscriptionModel(modelId, {
      provider: 'azure.transcription',
      url,
      headers: getHeaders,
      fetch,
    });

  const createSpeechModel = (modelId: string) =>
    new OpenAISpeechModel(modelId, {
      provider: 'azure.speech',
      url,
      headers: getHeaders,
      fetch,
    });

  const provider = function (deploymentId: string) {
    if (new.target) {
      throw new Error(
        'The Azure OpenAI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(deploymentId);
  };

  provider.languageModel = createChatModel;
  provider.chat = createChatModel;
  provider.deepseek = createDeepSeekModel;
  provider.completion = createCompletionModel;
  provider.embedding = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.responses = createResponsesModel;
  provider.transcription = createTranscriptionModel;
  provider.speech = createSpeechModel;
  provider.tools = azureOpenaiTools;
  return provider;
}

/**
Default Azure OpenAI provider instance.
 */
export const azure = createAzure();

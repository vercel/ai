import {
  OpenAIChatLanguageModel,
  OpenAICompletionLanguageModel,
  OpenAIEmbeddingModel,
  OpenAIImageModel,
  OpenAIResponsesLanguageModel,
  OpenAISpeechModel,
  OpenAITranscriptionModel,
} from '@ai-sdk/openai/internal';
import {
  EmbeddingModelV2,
  LanguageModelV2,
  ProviderV2,
  ImageModelV2,
  SpeechModelV2,
  TranscriptionModelV2,
} from '@ai-sdk/provider';
import { FetchFunction, loadApiKey, loadSetting } from '@ai-sdk/provider-utils';

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
}

/**
Create an Azure OpenAI provider instance.
 */
export function createAzure(
  options: AzureOpenAIProviderSettings = {},
): AzureOpenAIProvider {
  const getHeaders = () => ({
    'api-key': loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'AZURE_API_KEY',
      description: 'Azure OpenAI',
    }),
    ...options.headers,
  });

  const getResourceName = () =>
    loadSetting({
      settingValue: options.resourceName,
      settingName: 'resourceName',
      environmentVariableName: 'AZURE_RESOURCE_NAME',
      description: 'Azure OpenAI resource name',
    });

  const apiVersion = options.apiVersion ?? 'preview';

  const url = ({ path, modelId }: { path: string; modelId: string }) => {
    const baseUrlPrefix =
      options.baseURL ?? `https://${getResourceName()}.openai.azure.com/openai`;
    // Use v1 API format - no deployment ID in URL
    const fullUrl = new URL(`${baseUrlPrefix}/v1${path}`);
    fullUrl.searchParams.set('api-version', apiVersion);
    return fullUrl.toString();
  };

  const createChatModel = (deploymentName: string) =>
    new OpenAIChatLanguageModel(deploymentName, {
      provider: 'azure.chat',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createCompletionModel = (modelId: string) =>
    new OpenAICompletionLanguageModel(modelId, {
      provider: 'azure.completion',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createEmbeddingModel = (modelId: string) =>
    new OpenAIEmbeddingModel(modelId, {
      provider: 'azure.embeddings',
      headers: getHeaders,
      url,
      fetch: options.fetch,
    });

  const createResponsesModel = (modelId: string) =>
    new OpenAIResponsesLanguageModel(modelId, {
      provider: 'azure.responses',
      url,
      headers: getHeaders,
      fetch: options.fetch,
      fileIdPrefixes: ['assistant-'],
    });

  const createImageModel = (modelId: string) =>
    new OpenAIImageModel(modelId, {
      provider: 'azure.image',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createTranscriptionModel = (modelId: string) =>
    new OpenAITranscriptionModel(modelId, {
      provider: 'azure.transcription',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const createSpeechModel = (modelId: string) =>
    new OpenAISpeechModel(modelId, {
      provider: 'azure.speech',
      url,
      headers: getHeaders,
      fetch: options.fetch,
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
  provider.completion = createCompletionModel;
  provider.embedding = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.responses = createResponsesModel;
  provider.transcription = createTranscriptionModel;
  provider.speech = createSpeechModel;
  return provider;
}

/**
Default Azure OpenAI provider instance.
 */
export const azure = createAzure();

import {
  OpenAIChatLanguageModel,
  OpenAICompletionLanguageModel,
  OpenAIEmbeddingModel,
  OpenAIImageModel,
  OpenAIResponsesLanguageModel,
  OpenAISpeechModel,
  OpenAITranscriptionModel,
} from '@ai-sdk/openai/internal';

import { AzureChatLanguageModel } from './azure-chat-language-model';
import { AzureCompletionLanguageModel } from './azure-completion-language-model';
import { AzureEmbeddingModel } from './azure-embedding-model';
import { AzureResponsesLanguageModel } from './azure-responses-language-model';
import { AzureImageModel } from './azure-image-model';
import { AzureTranscriptionModel } from './azure-transcription-model';
import { AzureSpeechModel } from './azure-speech-model';
import {
  EmbeddingModelV3,
  LanguageModelV3,
  ProviderV3,
  ImageModelV3,
  SpeechModelV3,
  TranscriptionModelV3,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  loadApiKey,
  loadSetting,
  withUserAgentSuffix,
} from '@ai-sdk/provider-utils';
import { azureOpenaiTools } from './azure-openai-tools';
import { VERSION } from './version';

export interface AzureOpenAIProvider extends ProviderV3 {
  (deploymentId: string, settings?: AzureOpenAIModelSettings): LanguageModelV3;

  /**
Creates an Azure OpenAI chat model for text generation.
   */
  languageModel(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): LanguageModelV3;

  /**
Creates an Azure OpenAI chat model for text generation.
   */
  chat(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): LanguageModelV3;

  /**
Creates an Azure OpenAI responses API model for text generation.
   */
  responses(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): LanguageModelV3;

  /**
Creates an Azure OpenAI completion model for text generation.
   */
  completion(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): LanguageModelV3;

  /**
@deprecated Use `textEmbedding` instead.
   */
  embedding(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): EmbeddingModelV3<string>;

  /**
   * Creates an Azure OpenAI DALL-E model for image generation.
   */
  image(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): ImageModelV3;

  /**
   * Creates an Azure OpenAI DALL-E model for image generation.
   */
  imageModel(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): ImageModelV3;

  textEmbedding(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): EmbeddingModelV3<string>;

  /**
Creates an Azure OpenAI model for text embeddings.
   */
  textEmbeddingModel(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): EmbeddingModelV3<string>;

  /**
   * Creates an Azure OpenAI model for audio transcription.
   */
  transcription(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): TranscriptionModelV3;

  /**
   * Creates an Azure OpenAI model for speech generation.
   */
  speech(
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ): SpeechModelV3;

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

export interface AzureOpenAIModelSettings {
  /**
The underlying model name for telemetry and cost tracking (e.g., 'gpt-4o').
When specified, this will be used as the modelId for telemetry purposes,
while the deployment name is still used for Azure API calls.
   */
  modelName?: string;
}

/**
Create an Azure OpenAI provider instance.
 */
export function createAzure(
  options: AzureOpenAIProviderSettings = {},
): AzureOpenAIProvider {
  const getHeaders = () => {
    const baseHeaders = {
      'api-key': loadApiKey({
        apiKey: options.apiKey,
        environmentVariableName: 'AZURE_API_KEY',
        description: 'Azure OpenAI',
      }),
      ...options.headers,
    };
    return withUserAgentSuffix(baseHeaders, `ai-sdk/azure/${VERSION}`);
  };

  const getResourceName = () =>
    loadSetting({
      settingValue: options.resourceName,
      settingName: 'resourceName',
      environmentVariableName: 'AZURE_RESOURCE_NAME',
      description: 'Azure OpenAI resource name',
    });

  const apiVersion = options.apiVersion ?? 'v1';

  const url = ({
    path,
    modelId,
    deploymentName,
  }: {
    path: string;
    modelId: string;
    deploymentName?: string;
  }) => {
    const baseUrlPrefix =
      options.baseURL ?? `https://${getResourceName()}.openai.azure.com/openai`;

    let fullUrl: URL;
    if (options.useDeploymentBasedUrls) {
      // Use deployment-based format for compatibility with certain Azure OpenAI models
      // Use deploymentName if provided, otherwise fall back to modelId
      fullUrl = new URL(
        `${baseUrlPrefix}/deployments/${deploymentName ?? modelId}${path}`,
      );
    } else {
      // Use v1 API format - no deployment ID in URL
      fullUrl = new URL(`${baseUrlPrefix}/v1${path}`);
    }

    fullUrl.searchParams.set('api-version', apiVersion);
    return fullUrl.toString();
  };

  const createChatModel = (
    deploymentName: string,
    settings?: AzureOpenAIModelSettings,
  ) => {
    const openaiModel = new OpenAIChatLanguageModel(deploymentName, {
      provider: 'azure.chat',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
    return new AzureChatLanguageModel(openaiModel, settings?.modelName);
  };

  const createCompletionModel = (
    deploymentName: string,
    settings?: AzureOpenAIModelSettings,
  ) => {
    const openaiModel = new OpenAICompletionLanguageModel(deploymentName, {
      provider: 'azure.completion',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
    return new AzureCompletionLanguageModel(openaiModel, settings?.modelName);
  };

  const createEmbeddingModel = (
    deploymentName: string,
    settings?: AzureOpenAIModelSettings,
  ) => {
    const openaiModel = new OpenAIEmbeddingModel(deploymentName, {
      provider: 'azure.embeddings',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
    return new AzureEmbeddingModel(openaiModel, settings?.modelName);
  };

  const createResponsesModel = (
    deploymentName: string,
    settings?: AzureOpenAIModelSettings,
  ) => {
    const openaiModel = new OpenAIResponsesLanguageModel(deploymentName, {
      provider: 'azure.responses',
      url,
      headers: getHeaders,
      fetch: options.fetch,
      fileIdPrefixes: ['assistant-'],
    });
    return new AzureResponsesLanguageModel(openaiModel, settings?.modelName);
  };

  const createImageModel = (
    deploymentName: string,
    settings?: AzureOpenAIModelSettings,
  ) => {
    const openaiModel = new OpenAIImageModel(deploymentName, {
      provider: 'azure.image',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
    return new AzureImageModel(openaiModel, settings?.modelName);
  };

  const createTranscriptionModel = (
    deploymentName: string,
    settings?: AzureOpenAIModelSettings,
  ) => {
    const openaiModel = new OpenAITranscriptionModel(deploymentName, {
      provider: 'azure.transcription',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
    return new AzureTranscriptionModel(openaiModel, settings?.modelName);
  };

  const createSpeechModel = (
    deploymentName: string,
    settings?: AzureOpenAIModelSettings,
  ) => {
    const openaiModel = new OpenAISpeechModel(deploymentName, {
      provider: 'azure.speech',
      url,
      headers: getHeaders,
      fetch: options.fetch,
    });
    return new AzureSpeechModel(openaiModel, settings?.modelName);
  };

  const provider = function (
    deploymentId: string,
    settings?: AzureOpenAIModelSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Azure OpenAI model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(deploymentId, settings);
  };

  provider.specificationVersion = 'v3' as const;
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
  provider.tools = azureOpenaiTools;
  return provider;
}

/**
Default Azure OpenAI provider instance.
 */
export const azure = createAzure();

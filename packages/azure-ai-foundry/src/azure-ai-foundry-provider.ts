import {
  NoSuchModelError,
  type EmbeddingModelV3,
  type ImageModelV3,
  type LanguageModelV3,
  type ProviderV3,
  type SpeechModelV3,
  type TranscriptionModelV3,
} from '@ai-sdk/provider';
import {
  type FetchFunction,
  generateId,
  loadSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import {
  OpenAIChatLanguageModel,
  OpenAICompletionLanguageModel,
  OpenAIEmbeddingModel,
  OpenAIImageModel,
  OpenAIResponsesLanguageModel,
  OpenAISpeechModel,
  OpenAITranscriptionModel,
} from '@ai-sdk/openai/internal';
import { AnthropicMessagesLanguageModel } from '@ai-sdk/anthropic/internal';
import type { AzureAIFoundryChatModelId } from './azure-ai-foundry-chat-options';
import type { AzureAIFoundryEmbeddingModelId } from './azure-ai-foundry-embedding-options';
import type { AzureAIFoundryImageModelId } from './azure-ai-foundry-image-settings';
import {
  createOpenAIHeaderProvider,
  createAnthropicHeaderProvider,
} from './azure-ai-foundry-auth';
import { detectApiFormat } from './azure-ai-foundry-routing';
import { azureAIFoundryTools } from './azure-ai-foundry-tools';

export interface AzureAIFoundryProviderSettings {
  /**
   * Azure resource name. Used to construct the base URL:
   * `https://{resourceName}.services.ai.azure.com`
   *
   * Either this or `baseURL` must be provided. Falls back to
   * `AZURE_RESOURCE_NAME` environment variable.
   */
  resourceName?: string;

  /**
   * Full base URL override. When provided, `resourceName` is ignored.
   * Example: `https://my-resource.services.ai.azure.com`
   */
  baseURL?: string;

  /**
   * API key for authentication. Sent as `api-key` header for OpenAI
   * endpoints and `x-api-key` for Anthropic endpoints.
   *
   * Falls back to `AZURE_API_KEY` environment variable.
   */
  apiKey?: string;

  /**
   * Async token provider for Microsoft Entra ID (keyless) authentication.
   * Returns a bearer token string. Called on each request to support
   * token refresh.
   *
   * When both `apiKey` and `tokenProvider` are provided, `tokenProvider`
   * takes precedence.
   */
  tokenProvider?: () => Promise<string>;

  /**
   * Azure API version query parameter. Defaults to `'v1'`.
   * Appended as `?api-version={apiVersion}` to all OpenAI endpoint requests.
   */
  apiVersion?: string;

  /**
   * Anthropic API version header. Defaults to `'2023-06-01'`.
   */
  anthropicVersion?: string;

  /**
   * List of deployment names that should be routed to the Anthropic Messages
   * API instead of the OpenAI API. Used when a Claude deployment has a custom
   * name that doesn't match the `claude-*` auto-detection pattern.
   *
   * Deployments matching `claude-*` are always auto-detected regardless of
   * this setting.
   */
  anthropicDeployments?: string[];

  /**
   * Custom headers to include in all requests.
   */
  headers?: Record<string, string | undefined>;

  /**
   * Custom fetch implementation. You can use it as a middleware to intercept
   * requests, or to provide a custom fetch implementation for e.g. testing.
   */
  fetch?: FetchFunction;
}

export interface AzureAIFoundryProvider extends ProviderV3 {
  /**
   * Creates a language model for text generation. Auto-detects whether to use
   * the OpenAI Responses API or Anthropic Messages API based on the deployment
   * name.
   */
  (deploymentName: string): LanguageModelV3;

  /**
   * Creates a language model for text generation. Auto-detects OpenAI vs
   * Anthropic based on the deployment name. Claude deployments route to
   * AnthropicMessagesLanguageModel; all others route to
   * OpenAIResponsesLanguageModel.
   */
  languageModel(deploymentName: string): LanguageModelV3;

  /**
   * Creates a language model using the OpenAI Chat Completions API.
   */
  chat(deploymentName: AzureAIFoundryChatModelId): LanguageModelV3;

  /**
   * @deprecated Legacy completions API — NOT available in the v1 API.
   * Included for migration compatibility with `@ai-sdk/azure`.
   * Use `chat()` or `responses()` instead.
   */
  completion(deploymentName: AzureAIFoundryChatModelId): LanguageModelV3;

  /**
   * Creates a language model using the Anthropic Messages API path.
   */
  anthropic(deploymentName: string): LanguageModelV3;

  /**
   * Creates a language model using the OpenAI Responses API.
   */
  responses(deploymentName: AzureAIFoundryChatModelId): LanguageModelV3;

  /**
   * Creates an embedding model.
   */
  embeddingModel(
    deploymentName: AzureAIFoundryEmbeddingModelId,
  ): EmbeddingModelV3;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(
    deploymentName: AzureAIFoundryEmbeddingModelId,
  ): EmbeddingModelV3;

  /**
   * Creates an embedding model.
   */
  embedding(deploymentName: AzureAIFoundryEmbeddingModelId): EmbeddingModelV3;

  /**
   * @deprecated Use `embedding` instead.
   */
  textEmbedding(
    deploymentName: AzureAIFoundryEmbeddingModelId,
  ): EmbeddingModelV3;

  /**
   * Creates an image generation model.
   */
  imageModel(deploymentName: AzureAIFoundryImageModelId): ImageModelV3;

  /**
   * Creates an image generation model.
   */
  image(deploymentName: AzureAIFoundryImageModelId): ImageModelV3;

  /**
   * Creates a transcription model. Uses the legacy deployment-based API.
   */
  transcriptionModel(deploymentName: string): TranscriptionModelV3;

  /**
   * Creates a transcription model. Uses the legacy deployment-based API.
   */
  transcription(deploymentName: string): TranscriptionModelV3;

  /**
   * Creates a speech model. Uses the legacy deployment-based API.
   */
  speechModel(deploymentName: string): SpeechModelV3;

  /**
   * Creates a speech model. Uses the legacy deployment-based API.
   */
  speech(deploymentName: string): SpeechModelV3;

  /**
   * Azure AI Foundry-specific tools. Includes both OpenAI tools
   * (codeInterpreter, fileSearch, imageGeneration, webSearchPreview) and
   * Anthropic tools (bash, textEditor, computer, webSearch, codeExecution,
   * memory, toolSearchBm25, toolSearchRegex, webFetch) for use with the
   * respective deployment types.
   */
  tools: typeof azureAIFoundryTools;
}

/**
 * Create an Azure AI Foundry provider instance.
 */
export function createAzureAIFoundry(
  options: AzureAIFoundryProviderSettings = {},
): AzureAIFoundryProvider {
  // Lazy base URL resolution — defers error to model creation time
  const getBaseURL = (): string => {
    if (options.baseURL) {
      return withoutTrailingSlash(options.baseURL) ?? options.baseURL;
    }

    const resourceName = loadSetting({
      settingValue: options.resourceName,
      settingName: 'resourceName',
      environmentVariableName: 'AZURE_RESOURCE_NAME',
      description: 'Azure AI Foundry resource name',
    });

    return `https://${resourceName}.services.ai.azure.com`;
  };

  const anthropicVersion = options.anthropicVersion ?? '2023-06-01';

  // Build header providers
  const getOpenAIHeaders = createOpenAIHeaderProvider({
    apiKey: options.apiKey,
    tokenProvider: options.tokenProvider,
    headers: options.headers,
  });

  const getAnthropicHeaders = createAnthropicHeaderProvider({
    apiKey: options.apiKey,
    tokenProvider: options.tokenProvider,
    anthropicVersion,
    headers: options.headers,
  });

  // URL builders — apiVersion defaults to 'v1' (matching @ai-sdk/azure)
  const apiVersion = options.apiVersion ?? 'v1';

  // Standard v1 endpoint URL builder.
  // _modelId is required by the url callback signature but unused for v1 paths
  // (v1 routes by `model` param in the request body, not by URL).
  const openaiUrl = ({
    path,
    modelId: _modelId,
  }: {
    path: string;
    modelId: string;
  }): string => {
    const baseURL = getBaseURL();
    const fullUrl = new URL(`${baseURL}/openai/v1${path}`);
    fullUrl.searchParams.set('api-version', apiVersion);
    return fullUrl.toString();
  };

  // Legacy deployment-based URL builder for audio endpoints (transcription, speech).
  // These are NOT available under /openai/v1/ and require the deployment-based pattern:
  // {baseURL}/openai/deployments/{modelId}/{path}?api-version=2025-04-01-preview
  const legacyDeploymentUrl = ({
    path,
    modelId,
  }: {
    path: string;
    modelId: string;
  }): string => {
    const baseURL = getBaseURL();
    const suffix = path.replace(/^\//, '');
    const fullUrl = new URL(
      `${baseURL}/openai/deployments/${modelId}/${suffix}`,
    );
    fullUrl.searchParams.set('api-version', '2025-04-01-preview');
    return fullUrl.toString();
  };

  // ─── Model Factories ───

  const createChatModel = (deploymentName: string) =>
    new OpenAIChatLanguageModel(deploymentName, {
      provider: 'azure-ai-foundry.chat',
      url: openaiUrl,
      headers: getOpenAIHeaders,
      fetch: options.fetch,
    });

  // Legacy completions — NOT in v1 GA API. Included for migration from @ai-sdk/azure.
  const createCompletionModel = (deploymentName: string) =>
    new OpenAICompletionLanguageModel(deploymentName, {
      provider: 'azure-ai-foundry.completion',
      url: openaiUrl,
      headers: getOpenAIHeaders,
      fetch: options.fetch,
    });

  const createAnthropicModel = (deploymentName: string): LanguageModelV3 =>
    new AnthropicMessagesLanguageModel(deploymentName, {
      provider: 'azure-ai-foundry.anthropic',
      // AnthropicMessagesLanguageModel appends /messages internally,
      // so baseURL must include /anthropic/v1 to produce /anthropic/v1/messages
      baseURL: `${getBaseURL()}/anthropic/v1`,
      headers: getAnthropicHeaders,
      fetch: options.fetch,
      generateId,
      // NOTE: supportedUrls allows all HTTP URLs, matching anthropic-provider.ts:140-143.
      // If Azure doesn't support URL fetching, change to `supportedUrls: () => ({})`
      // to force download + base64 conversion (like google-vertex does).
      supportedUrls: () => ({
        'image/*': [/^https?:\/\/.*$/],
        'application/pdf': [/^https?:\/\/.*$/],
      }),
    });

  // Responses API model with Claude guard clause
  const createResponsesModel = (deploymentName: string) => {
    if (
      detectApiFormat(deploymentName, options.anthropicDeployments) ===
      'anthropic'
    ) {
      throw new NoSuchModelError({
        modelId: deploymentName,
        modelType: 'languageModel',
      });
    }
    return new OpenAIResponsesLanguageModel(deploymentName, {
      provider: 'azure-ai-foundry.responses',
      url: openaiUrl,
      headers: getOpenAIHeaders,
      fetch: options.fetch,
      fileIdPrefixes: ['assistant-'],
    });
  };

  const createEmbeddingModel = (deploymentName: string) => {
    if (
      detectApiFormat(deploymentName, options.anthropicDeployments) ===
      'anthropic'
    ) {
      throw new NoSuchModelError({
        modelId: deploymentName,
        modelType: 'embeddingModel',
      });
    }
    return new OpenAIEmbeddingModel(deploymentName, {
      provider: 'azure-ai-foundry.embedding',
      url: openaiUrl,
      headers: getOpenAIHeaders,
      fetch: options.fetch,
    });
  };

  const createImageModel = (deploymentName: string) => {
    if (
      detectApiFormat(deploymentName, options.anthropicDeployments) ===
      'anthropic'
    ) {
      throw new NoSuchModelError({
        modelId: deploymentName,
        modelType: 'imageModel',
      });
    }
    return new OpenAIImageModel(deploymentName, {
      provider: 'azure-ai-foundry.image',
      url: openaiUrl,
      headers: getOpenAIHeaders,
      fetch: options.fetch,
    });
  };

  // Audio models use legacy deployment-based URLs
  const createTranscriptionModel = (deploymentName: string) =>
    new OpenAITranscriptionModel(deploymentName, {
      provider: 'azure-ai-foundry.transcription',
      url: legacyDeploymentUrl,
      headers: getOpenAIHeaders,
      fetch: options.fetch,
    });

  const createSpeechModel = (deploymentName: string) =>
    new OpenAISpeechModel(deploymentName, {
      provider: 'azure-ai-foundry.speech',
      url: legacyDeploymentUrl,
      headers: getOpenAIHeaders,
      fetch: options.fetch,
    });

  // ProviderV3 canonical method — auto-detects Claude deployments.
  // Claude → AnthropicMessagesLanguageModel; all others → OpenAIResponsesLanguageModel.
  const createLanguageModel = (deploymentName: string): LanguageModelV3 => {
    if (
      detectApiFormat(deploymentName, options.anthropicDeployments) ===
      'anthropic'
    ) {
      return createAnthropicModel(deploymentName);
    }
    return createResponsesModel(deploymentName);
  };

  // ─── Provider Assembly ───

  const provider = function (deploymentName: string) {
    if (new.target) {
      throw new Error(
        'The Azure AI Foundry model function cannot be called with the new keyword.',
      );
    }
    return createLanguageModel(deploymentName);
  };

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createLanguageModel;
  provider.chat = createChatModel;
  provider.completion = createCompletionModel;
  provider.anthropic = createAnthropicModel;
  provider.responses = createResponsesModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.imageModel = createImageModel;
  provider.image = createImageModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.transcription = createTranscriptionModel;
  provider.speechModel = createSpeechModel;
  provider.speech = createSpeechModel;
  provider.tools = azureAIFoundryTools;

  return provider as AzureAIFoundryProvider;
}

/**
 * Default Azure AI Foundry provider instance.
 */
export const azureAIFoundry = createAzureAIFoundry();

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
  type EmbeddingModelV3,
  type LanguageModelV3,
  type ProviderV3,
  type ImageModelV3,
  type SharedV3Warning,
  type SpeechModelV3,
  type TranscriptionModelV3,
} from '@ai-sdk/provider';
import {
  loadApiKey,
  loadSetting,
  normalizeHeaders,
  parseProviderOptions,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import {
  azureImageModelOptions,
  isMAIImageModel,
} from './azure-image-model-options';
import { AzureMaiImageModel } from './azure-mai-image-model';
import { azureOpenaiTools } from './azure-openai-tools';
import {
  azureSpeechModelOptions,
  getMAIVoiceModel,
} from './azure-speech-model-options';
import { AzureSpeechSpeechModel } from './azure-speech-speech-model';
import { AzureSpeechTranscriptionModel } from './azure-speech-transcription-model';
import {
  azureTranscriptionModelOptions,
  getMAITranscribeModel,
} from './azure-transcription-model-options';
import { VERSION } from './version';

export interface AzureOpenAIProvider extends ProviderV3 {
  (deploymentId: string): LanguageModelV3;

  /**
   * Creates an Azure OpenAI responses API model for text generation.
   */
  languageModel(deploymentId: string): LanguageModelV3;

  /**
   * Creates an Azure OpenAI chat model for text generation.
   */
  chat(deploymentId: string): LanguageModelV3;

  /**
   * Creates an Azure-hosted DeepSeek chat model for text generation.
   */
  deepseek(deploymentId: string): LanguageModelV3;

  /**
   * Creates an Azure OpenAI responses API model for text generation.
   */
  responses(deploymentId: string): LanguageModelV3;

  /**
   * Creates an Azure OpenAI completion model for text generation.
   */
  completion(deploymentId: string): LanguageModelV3;

  /**
   * Creates an Azure OpenAI model for text embeddings.
   */
  embedding(deploymentId: string): EmbeddingModelV3;

  /**
   * Creates an Azure OpenAI model for text embeddings.
   */
  embeddingModel(deploymentId: string): EmbeddingModelV3;

  /**
   * @deprecated Use `embedding` instead.
   */
  textEmbedding(deploymentId: string): EmbeddingModelV3;

  /**
   * @deprecated Use `embeddingModel` instead.
   */
  textEmbeddingModel(deploymentId: string): EmbeddingModelV3;

  /**
   * Creates an Azure image model. MAI-Image models use the MAI image API by
   * default; other IDs use OpenAI. Override with providerOptions.azure.api.
   */
  image(deploymentId: string): ImageModelV3;

  /**
   * Creates an Azure image model. Alias of `image`.
   */
  imageModel(deploymentId: string): ImageModelV3;

  /**
   * Creates an Azure transcription model. MAI-Transcribe models use the Speech
   * API by default; other IDs use OpenAI. Override with providerOptions.azure.api.
   */
  transcription(deploymentId: string): TranscriptionModelV3;

  /**
   * Creates an Azure transcription model. Alias of `transcription`.
   */
  transcriptionModel(deploymentId: string): TranscriptionModelV3;

  /**
   * Creates an Azure speech generation model. MAI-Voice models use the Speech
   * API by default; other IDs use OpenAI. Override with providerOptions.azure.api.
   */
  speech(deploymentId: string): SpeechModelV3;

  /**
   * Creates an Azure speech generation model. Alias of `speech`.
   */
  speechModel(deploymentId: string): SpeechModelV3;

  /**
   * AzureOpenAI-specific tools.
   */
  tools: typeof azureOpenaiTools;
}

export interface AzureOpenAIProviderSettings {
  /**
   * Name of the Azure OpenAI resource. Either this or `baseURL` can be used.
   *
   * The resource name is used in the assembled URL: `https://{resourceName}.openai.azure.com/openai/v1{path}`.
   * It must be a single DNS label (letters, digits, and hyphens).
   */
  resourceName?: string;

  /**
   * Use a different URL prefix for API calls, e.g. to use proxy servers. Either this or `resourceName` can be used.
   * When a baseURL is provided, the resourceName is ignored.
   *
   * With an unversioned Azure OpenAI baseURL, the resolved URL is `{baseURL}/v1{path}`.
   * Azure OpenAI base URLs that already end in `/openai/v1` are used as-is.
   * With a non-Azure custom gateway baseURL, the resolved URL is `{baseURL}{path}`.
   */
  baseURL?: string;

  /**
   * API key for authenticating requests.
   */
  apiKey?: string;

  /**
   * A function that returns an access token for Microsoft Entra
   * (formerly known as Azure Active Directory), which will be invoked
   * on every request.
   */
  tokenProvider?: (() => Promise<string>) | undefined;

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
   * Custom api version to use. Defaults to `v1`.
   * Complete v1 base URLs are used as-is.
   */
  apiVersion?: string;

  /**
   * Use deployment-based URLs for specific model types. Set to true to use legacy deployment format:
   * `{baseURL}/deployments/{deploymentId}{path}?api-version={apiVersion}` instead of
   * `{baseURL}/v1{path}?api-version={apiVersion}`.
   */
  useDeploymentBasedUrls?: boolean;

  /**
   * URL prefix for Azure Speech (MAI-Transcribe transcription and MAI-Voice
   * speech), e.g. a regional endpoint like
   * `https://eastus.api.cognitive.microsoft.com`.
   * Defaults to `https://{resourceName}.cognitiveservices.azure.com`.
   * Speech requests do not use `baseURL` or `apiVersion`.
   */
  speechBaseURL?: string;

  /**
   * URL prefix for MAI image requests (MAI-Image generations and edits).
   * Defaults to `https://{resourceName}.services.ai.azure.com/mai/v1`.
   */
  maiBaseURL?: string;
}

function getAzureOpenAIBaseURLInfo(baseURL: string | undefined) {
  if (baseURL == null) {
    return {
      isAzureOpenAI: true,
      isFoundryProject: false,
      isVersioned: false,
    };
  }

  const url = new URL(baseURL);
  const hostname = url.hostname;
  const isAzureOpenAI =
    hostname.endsWith('.openai.azure.com') ||
    hostname.endsWith('.services.ai.azure.com') ||
    hostname.endsWith('.cognitiveservices.azure.com');
  const pathname = url.pathname.replace(/\/+$/, '');

  return {
    isAzureOpenAI,
    isFoundryProject:
      hostname.endsWith('.services.ai.azure.com') &&
      pathname.startsWith('/api/projects/'),
    isVersioned: isAzureOpenAI && pathname.toLowerCase().endsWith('/openai/v1'),
  };
}

/**
 * Create an Azure OpenAI provider instance.
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

  const getHeaders = (api: 'mai' | 'openai' | 'speech' = 'openai') => {
    const authHeaders = tokenProvider
      ? {}
      : {
          [api === 'speech' ? 'Ocp-Apim-Subscription-Key' : 'api-key']:
            loadApiKey({
              apiKey: options.apiKey,
              environmentVariableName: 'AZURE_API_KEY',
              description:
                api === 'speech'
                  ? 'Azure Speech'
                  : api === 'mai'
                    ? 'Azure MAI'
                    : 'Azure OpenAI',
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

  const getResourceName = () => {
    const resourceName = loadSetting({
      settingValue: options.resourceName,
      settingName: 'resourceName',
      environmentVariableName: 'AZURE_RESOURCE_NAME',
      description: 'Azure OpenAI resource name',
    });

    // The resource name becomes part of the request host, so only a DNS label
    // is accepted (e.g. `user@internal:8080/#` would rewrite the host).
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(resourceName)) {
      throw new InvalidArgumentError({
        argument: 'resourceName',
        message:
          'Invalid Azure resource name. Expected a single DNS label (letters, digits, and hyphens). Use `baseURL` for custom endpoints.',
      });
    }

    return resourceName;
  };

  const apiVersion = options.apiVersion ?? 'v1';
  const {
    isAzureOpenAI,
    isFoundryProject,
    isVersioned: isAzureOpenAIVersioned,
  } = getAzureOpenAIBaseURLInfo(options.baseURL);

  const url = ({ path, modelId }: { path: string; modelId: string }) => {
    const baseUrlPrefix = withoutTrailingSlash(
      options.baseURL ?? `https://${getResourceName()}.openai.azure.com/openai`,
    );

    let fullUrl: URL;
    if (options.useDeploymentBasedUrls) {
      // Use deployment-based format for compatibility with certain Azure OpenAI models
      fullUrl = new URL(`${baseUrlPrefix}/deployments/${modelId}${path}`);
    } else if (!isAzureOpenAI || isAzureOpenAIVersioned) {
      // Custom gateways can own Azure routing and versioning themselves.
      // Complete Azure OpenAI v1 URLs also own their versioning.
      fullUrl = new URL(`${baseUrlPrefix}${path}`);
    } else {
      // Use v1 API format - no deployment ID in URL
      fullUrl = new URL(`${baseUrlPrefix}/v1${path}`);
    }

    if (
      options.useDeploymentBasedUrls ||
      (isAzureOpenAI && !isAzureOpenAIVersioned && !isFoundryProject)
    ) {
      fullUrl.searchParams.set('api-version', apiVersion);
    }

    return fullUrl.toString();
  };

  const createChatModel = (deploymentName: string) =>
    new OpenAIChatLanguageModel(deploymentName, {
      provider: 'azure.chat',
      url,
      headers: getHeaders,
      fetch,
    });

  const createDeepSeekModel = (deploymentName: string) =>
    new DeepSeekChatLanguageModel(deploymentName, {
      provider: 'azure.deepseek',
      url,
      headers: getHeaders,
      fetch,
      supportsPenaltySampling: true,
      supportsThinking: false,
      // json_object with thinking enabled makes Azure return the JSON in reasoning_content with empty content
      supportsStructuredOutputs: true,
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
      explicitMessageItemType: isFoundryProject,
      fileIdPrefixes: ['assistant-'],
    });

  const maiBaseURL = () =>
    withoutTrailingSlash(options.maiBaseURL) ??
    `https://${getResourceName()}.services.ai.azure.com/mai/v1`;

  const createImageModel = (modelId: string) =>
    new AzureImageModel(
      modelId,
      new OpenAIImageModel(modelId, {
        provider: 'azure.image',
        url,
        headers: getHeaders,
        fetch,
      }),
      new AzureMaiImageModel(modelId, {
        url: path => `${maiBaseURL()}${path}`,
        headers: () => getHeaders('mai'),
        fetch,
      }),
    );

  const speechBaseURL = () =>
    withoutTrailingSlash(options.speechBaseURL) ??
    `https://${getResourceName()}.cognitiveservices.azure.com`;

  const createTranscriptionModel = (modelId: string) =>
    new AzureTranscriptionModel(
      modelId,
      options,
      new OpenAITranscriptionModel(modelId, {
        provider: 'azure.transcription',
        url,
        headers: getHeaders,
        fetch,
      }),
      new AzureSpeechTranscriptionModel(modelId, {
        url: () =>
          `${speechBaseURL()}/speechtotext/transcriptions:transcribe?api-version=2025-10-15`,
        headers: () => getHeaders('speech'),
        fetch,
      }),
    );

  const createSpeechModel = (modelId: string) =>
    new AzureSpeechModel(
      modelId,
      new OpenAISpeechModel(modelId, {
        provider: 'azure.speech',
        url,
        headers: getHeaders,
        fetch,
      }),
      new AzureSpeechSpeechModel(modelId, {
        url: () => `${speechBaseURL()}/tts/cognitiveservices/v1`,
        headers: () => getHeaders('speech'),
        fetch,
      }),
    );

  const provider = function (deploymentId: string) {
    if (new.target) {
      throw new Error(
        'The Azure OpenAI model function cannot be called with the new keyword.',
      );
    }

    return createResponsesModel(deploymentId);
  };

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createResponsesModel;
  provider.chat = createChatModel;
  provider.deepseek = createDeepSeekModel;
  provider.completion = createCompletionModel;
  provider.embedding = createEmbeddingModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.responses = createResponsesModel;
  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;
  provider.speech = createSpeechModel;
  provider.speechModel = createSpeechModel;
  provider.tools = azureOpenaiTools;
  return provider;
}

/**
 * Default Azure OpenAI provider instance.
 */
export const azure = createAzure();

// Resolves the API per request: providerOptions also reach this model via Gateway.
class AzureTranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'azure.transcription';

  constructor(
    readonly modelId: string,
    private readonly config: AzureOpenAIProviderSettings,
    private readonly openai: OpenAITranscriptionModel,
    private readonly speech: AzureSpeechTranscriptionModel,
  ) {}

  async doGenerate(options: Parameters<TranscriptionModelV3['doGenerate']>[0]) {
    const { api, ...speechOptions } = await this.getOptions(
      options.providerOptions,
    );
    if (api === 'speech') {
      return this.speech.doGenerate(options, speechOptions);
    }

    const result = await this.openai.doGenerate(options);
    return {
      ...result,
      warnings: [
        ...result.warnings,
        ...Object.keys(speechOptions).map(key => ({
          type: 'unsupported' as const,
          feature: `providerOptions.azure.${key}`,
          details: 'This option requires the Azure Speech API.',
        })),
      ],
    };
  }

  private async getOptions(
    providerOptions: Parameters<
      TranscriptionModelV3['doGenerate']
    >[0]['providerOptions'],
  ) {
    const options = await parseProviderOptions({
      provider: 'azure',
      providerOptions,
      schema: azureTranscriptionModelOptions,
    });
    return {
      ...options,
      api:
        options?.api ??
        (getMAITranscribeModel(this.modelId) ? 'speech' : 'openai'),
    };
  }
}

// Resolves the API per request: providerOptions also reach this model via Gateway.
class AzureSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'azure.speech';

  constructor(
    readonly modelId: string,
    private readonly openai: OpenAISpeechModel,
    private readonly speech: AzureSpeechSpeechModel,
  ) {}

  async doGenerate(options: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const { api, ...speechOptions } =
      (await parseProviderOptions({
        provider: 'azure',
        providerOptions: options.providerOptions,
        schema: azureSpeechModelOptions,
      })) ?? {};
    if (
      (api ?? (getMAIVoiceModel(this.modelId) ? 'speech' : 'openai')) ===
      'speech'
    ) {
      return this.speech.doGenerate(options, speechOptions);
    }

    const result = await this.openai.doGenerate(options);
    return {
      ...result,
      warnings: [
        ...result.warnings,
        ...Object.entries(speechOptions)
          .filter(([, value]) => value !== undefined)
          .map(
            ([key]): SharedV3Warning => ({
              type: 'unsupported',
              feature: `providerOptions.azure.${key}`,
              details: 'This option requires the Azure Speech API.',
            }),
          ),
      ],
    };
  }
}

// Resolves the API per request: providerOptions also reach this model via Gateway.
class AzureImageModel implements ImageModelV3 {
  readonly specificationVersion = 'v3';
  readonly provider = 'azure.image';

  constructor(
    readonly modelId: string,
    private readonly openai: OpenAIImageModel,
    private readonly mai: AzureMaiImageModel,
  ) {}

  get maxImagesPerCall() {
    return isMAIImageModel(this.modelId) ? 1 : this.openai.maxImagesPerCall;
  }

  async doGenerate(options: Parameters<ImageModelV3['doGenerate']>[0]) {
    const { api, ...maiOptions } =
      (await parseProviderOptions({
        provider: 'azure',
        providerOptions: options.providerOptions,
        schema: azureImageModelOptions,
      })) ?? {};
    if ((api ?? (isMAIImageModel(this.modelId) ? 'mai' : 'openai')) === 'mai') {
      return this.mai.doGenerate(options, maiOptions);
    }

    const result = await this.openai.doGenerate(options);
    return {
      ...result,
      warnings: [
        ...result.warnings,
        ...Object.entries(maiOptions)
          .filter(([, value]) => value !== undefined)
          .map(
            ([key]): SharedV3Warning => ({
              type: 'unsupported',
              feature: `providerOptions.azure.${key}`,
              details: 'This option requires the MAI image API.',
            }),
          ),
      ],
    };
  }
}

import { anthropicTools } from '@ai-sdk/anthropic/internal';
import type {
  EmbeddingModelV3,
  ImageModelV3,
  LanguageModelV3,
  ProviderV3,
  RerankingModelV3,
} from '@ai-sdk/provider';
import {
  generateId,
  loadOptionalSetting,
  loadSetting,
  withoutTrailingSlash,
  withUserAgentSuffix,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-provider.ts
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import type { BedrockChatModelId } from './bedrock-chat-options';
import { BedrockEmbeddingModel } from './bedrock-embedding-model';
import type { BedrockEmbeddingModelId } from './bedrock-embedding-options';
import { BedrockImageModel } from './bedrock-image-model';
import type { BedrockImageModelId } from './bedrock-image-settings';
=======
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';
import type { AmazonBedrockChatModelId } from './amazon-bedrock-chat-language-model-options';
import { AmazonBedrockEmbeddingModel } from './amazon-bedrock-embedding-model';
import type {
  AmazonBedrockEmbeddingModelId,
  AmazonBedrockEmbeddingModelSettings,
} from './amazon-bedrock-embedding-model-options';
import { AmazonBedrockImageModel } from './amazon-bedrock-image-model';
import type { AmazonBedrockImageModelId } from './amazon-bedrock-image-settings';
>>>>>>> 5d2229e7f0 (feat(amazon-bedrock): add model family setting for embeddings to support ARN (#19854)):packages/amazon-bedrock/src/amazon-bedrock-provider.ts
import {
  createApiKeyFetchFunction,
  createSigV4FetchFunction,
  type BedrockCredentials,
} from './bedrock-sigv4-fetch';
import { BedrockRerankingModel } from './reranking/bedrock-reranking-model';
import type { BedrockRerankingModelId } from './reranking/bedrock-reranking-options';
import { VERSION } from './version';

export interface AmazonBedrockProviderSettings {
  /**
   * The AWS region to use for the Bedrock provider. Defaults to the value of the
   * `AWS_REGION` environment variable.
   */
  region?: string;

  /**
   * API key for authenticating requests using Bearer token authentication.
   * When provided, this will be used instead of AWS SigV4 authentication.
   * Defaults to the value of the `AWS_BEARER_TOKEN_BEDROCK` environment variable.
   *
   * @example
   * ```typescript
   * // Using API key directly
   * const bedrock = createAmazonBedrock({
   * apiKey: 'your-api-key-here',
   * region: 'us-east-1'
   * });
   *
   * // Using environment variable AWS_BEARER_TOKEN_BEDROCK
   * const bedrock = createAmazonBedrock({
   * region: 'us-east-1'
   * });
   * ```
   *
   * Note: When `apiKey` is provided, it takes precedence over AWS SigV4 authentication.
   * If neither `apiKey` nor `AWS_BEARER_TOKEN_BEDROCK` environment variable is set,
   * the provider will fall back to AWS SigV4 authentication using AWS credentials.
   */
  apiKey?: string;

  /**
   * The AWS access key ID to use for the Bedrock provider. Defaults to the value of the
   * `AWS_ACCESS_KEY_ID` environment variable.
   */
  accessKeyId?: string;

  /**
   * The AWS secret access key to use for the Bedrock provider. Defaults to the value of the
   * `AWS_SECRET_ACCESS_KEY` environment variable.
   */
  secretAccessKey?: string;

  /**
   * The AWS session token to use for the Bedrock provider. When `accessKeyId` and
   * `secretAccessKey` are both passed explicitly as options, only this field is used
   * If either access key field is omitted and resolved from the environment, the
   * session token also falls back to `AWS_SESSION_TOKEN` when not set here.
   */
  sessionToken?: string;

  /**
   * Base URL for the Bedrock API calls.
   */
  baseURL?: string;

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
   * The AWS credential provider to use for the Bedrock provider to get dynamic
   * credentials similar to the AWS SDK. Setting a provider here will cause its
   * credential values to be used instead of the `accessKeyId`, `secretAccessKey`,
   * and `sessionToken` settings.
   */
  credentialProvider?: () => PromiseLike<Omit<BedrockCredentials, 'region'>>;

  // for testing
  generateId?: () => string;
}

export interface AmazonBedrockProvider extends ProviderV3 {
  (modelId: BedrockChatModelId): LanguageModelV3;

  languageModel(modelId: BedrockChatModelId): LanguageModelV3;

  /**
   * Creates a model for text embeddings.
   */
<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-provider.ts
  embedding(modelId: BedrockEmbeddingModelId): EmbeddingModelV3;
=======
  embedding(
    modelId: AmazonBedrockEmbeddingModelId,
    settings?: AmazonBedrockEmbeddingModelSettings,
  ): EmbeddingModelV4;
>>>>>>> 5d2229e7f0 (feat(amazon-bedrock): add model family setting for embeddings to support ARN (#19854)):packages/amazon-bedrock/src/amazon-bedrock-provider.ts

  /**
   * Creates a model for text embeddings.
   */
<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-provider.ts
  embeddingModel(modelId: BedrockEmbeddingModelId): EmbeddingModelV3;
=======
  embeddingModel(
    modelId: AmazonBedrockEmbeddingModelId,
    settings?: AmazonBedrockEmbeddingModelSettings,
  ): EmbeddingModelV4;
>>>>>>> 5d2229e7f0 (feat(amazon-bedrock): add model family setting for embeddings to support ARN (#19854)):packages/amazon-bedrock/src/amazon-bedrock-provider.ts

  /**
   * @deprecated Use `embedding` instead.
   */
<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-provider.ts
  textEmbedding(modelId: BedrockEmbeddingModelId): EmbeddingModelV3;
=======
  textEmbedding(
    modelId: AmazonBedrockEmbeddingModelId,
    settings?: AmazonBedrockEmbeddingModelSettings,
  ): EmbeddingModelV4;
>>>>>>> 5d2229e7f0 (feat(amazon-bedrock): add model family setting for embeddings to support ARN (#19854)):packages/amazon-bedrock/src/amazon-bedrock-provider.ts

  /**
   * @deprecated Use `embeddingModel` instead.
   */
<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-provider.ts
  textEmbeddingModel(modelId: BedrockEmbeddingModelId): EmbeddingModelV3;
=======
  textEmbeddingModel(
    modelId: AmazonBedrockEmbeddingModelId,
    settings?: AmazonBedrockEmbeddingModelSettings,
  ): EmbeddingModelV4;
>>>>>>> 5d2229e7f0 (feat(amazon-bedrock): add model family setting for embeddings to support ARN (#19854)):packages/amazon-bedrock/src/amazon-bedrock-provider.ts

  /**
   * Creates a model for image generation.
   */
  image(modelId: BedrockImageModelId): ImageModelV3;

  /**
   * Creates a model for image generation.
   */
  imageModel(modelId: BedrockImageModelId): ImageModelV3;

  /**
   * Creates a model for reranking documents.
   */
  reranking(modelId: BedrockRerankingModelId): RerankingModelV3;

  /**
   * Creates a model for reranking documents.
   */
  rerankingModel(modelId: BedrockRerankingModelId): RerankingModelV3;

  /**
   * Anthropic-specific tools that can be used with Anthropic models on Bedrock.
   */
  tools: typeof anthropicTools;
}

/**
 * Create an Amazon Bedrock provider instance.
 */
export function createAmazonBedrock(
  options: AmazonBedrockProviderSettings = {},
): AmazonBedrockProvider {
  // Check for API key authentication first
  const rawApiKey = loadOptionalSetting({
    settingValue: options.apiKey,
    environmentVariableName: 'AWS_BEARER_TOKEN_BEDROCK',
  });

  // FIX 1: Validate API key to ensure proper fallback to SigV4
  // Only use API key if it's a non-empty, non-whitespace string
  const apiKey =
    rawApiKey && rawApiKey.trim().length > 0 ? rawApiKey.trim() : undefined;

  // Use API key authentication if available, otherwise fall back to SigV4
  const fetchFunction = apiKey
    ? createApiKeyFetchFunction(apiKey, options.fetch)
    : createSigV4FetchFunction(async () => {
        const region = loadSetting({
          settingValue: options.region,
          settingName: 'region',
          environmentVariableName: 'AWS_REGION',
          description: 'AWS region',
        });

        // If a credential provider is provided, use it to get the credentials.
        if (options.credentialProvider) {
          try {
            return {
              ...(await options.credentialProvider()),
              region,
            };
          } catch (error) {
            // Error handling for credential provider failures
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            throw new Error(
              `AWS credential provider failed: ${errorMessage}. ` +
                'Please ensure your credential provider returns valid AWS credentials ' +
                'with accessKeyId and secretAccessKey properties.',
            );
          }
        }

        // Enhanced error handling for SigV4 credential loading
        try {
          return {
            region,
            accessKeyId: loadSetting({
              settingValue: options.accessKeyId,
              settingName: 'accessKeyId',
              environmentVariableName: 'AWS_ACCESS_KEY_ID',
              description: 'AWS access key ID',
            }),
            secretAccessKey: loadSetting({
              settingValue: options.secretAccessKey,
              settingName: 'secretAccessKey',
              environmentVariableName: 'AWS_SECRET_ACCESS_KEY',
              description: 'AWS secret access key',
            }),
            sessionToken:
              options.accessKeyId != null && options.secretAccessKey != null
                ? options.sessionToken
                : loadOptionalSetting({
                    settingValue: options.sessionToken,
                    environmentVariableName: 'AWS_SESSION_TOKEN',
                  }),
          };
        } catch (error) {
          // Provide helpful error message for missing AWS credentials
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          if (
            errorMessage.includes('AWS_ACCESS_KEY_ID') ||
            errorMessage.includes('accessKeyId')
          ) {
            throw new Error(
              'AWS SigV4 authentication requires AWS credentials. Please provide either:\n' +
                '1. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY environment variables\n' +
                '2. Provide accessKeyId and secretAccessKey in options\n' +
                '3. Use a credentialProvider function\n' +
                '4. Use API key authentication with AWS_BEARER_TOKEN_BEDROCK or apiKey option\n' +
                `Original error: ${errorMessage}`,
            );
          }
          if (
            errorMessage.includes('AWS_SECRET_ACCESS_KEY') ||
            errorMessage.includes('secretAccessKey')
          ) {
            throw new Error(
              'AWS SigV4 authentication requires both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY. ' +
                'Please ensure both credentials are provided.\n' +
                `Original error: ${errorMessage}`,
            );
          }
          // Re-throw other errors as-is
          throw error;
        }
      }, options.fetch);

  const getHeaders = () => {
    const baseHeaders = options.headers ?? {};
    return withUserAgentSuffix(baseHeaders, `ai-sdk/amazon-bedrock/${VERSION}`);
  };

  const getBedrockRuntimeBaseUrl = (): string =>
    withoutTrailingSlash(
      options.baseURL ??
        `https://bedrock-runtime.${loadSetting({
          settingValue: options.region,
          settingName: 'region',
          environmentVariableName: 'AWS_REGION',
          description: 'AWS region',
        })}.amazonaws.com`,
    ) ?? `https://bedrock-runtime.us-east-1.amazonaws.com`;

  const getBedrockAgentRuntimeBaseUrl = (): string =>
    withoutTrailingSlash(
      options.baseURL ??
        `https://bedrock-agent-runtime.${loadSetting({
          settingValue: options.region,
          settingName: 'region',
          environmentVariableName: 'AWS_REGION',
          description: 'AWS region',
        })}.amazonaws.com`,
    ) ?? `https://bedrock-agent-runtime.us-west-2.amazonaws.com`;

  const createChatModel = (modelId: BedrockChatModelId) =>
    new BedrockChatLanguageModel(modelId, {
      baseUrl: getBedrockRuntimeBaseUrl,
      headers: getHeaders,
      fetch: fetchFunction,
      generateId,
    });

  const provider = function (modelId: BedrockChatModelId) {
    if (new.target) {
      throw new Error(
        'The Amazon Bedrock model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId);
  };

<<<<<<< HEAD:packages/amazon-bedrock/src/bedrock-provider.ts
  const createEmbeddingModel = (modelId: BedrockEmbeddingModelId) =>
    new BedrockEmbeddingModel(modelId, {
      baseUrl: getBedrockRuntimeBaseUrl,
=======
  const createEmbeddingModel = (
    modelId: AmazonBedrockEmbeddingModelId,
    settings: AmazonBedrockEmbeddingModelSettings = {},
  ) =>
    new AmazonBedrockEmbeddingModel(modelId, {
      baseUrl: getAmazonBedrockRuntimeBaseUrl,
>>>>>>> 5d2229e7f0 (feat(amazon-bedrock): add model family setting for embeddings to support ARN (#19854)):packages/amazon-bedrock/src/amazon-bedrock-provider.ts
      headers: getHeaders,
      fetch: fetchFunction,
      modelFamily: settings.modelFamily,
    });

  const createImageModel = (modelId: BedrockImageModelId) =>
    new BedrockImageModel(modelId, {
      baseUrl: getBedrockRuntimeBaseUrl,
      headers: getHeaders,
      fetch: fetchFunction,
    });

  const createRerankingModel = (modelId: BedrockRerankingModelId) =>
    new BedrockRerankingModel(modelId, {
      baseUrl: getBedrockAgentRuntimeBaseUrl,
      region: loadSetting({
        settingValue: options.region,
        settingName: 'region',
        environmentVariableName: 'AWS_REGION',
        description: 'AWS region',
      }),
      headers: getHeaders,
      fetch: fetchFunction,
    });

  provider.specificationVersion = 'v3' as const;
  provider.languageModel = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.embeddingModel = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;
  provider.reranking = createRerankingModel;
  provider.rerankingModel = createRerankingModel;
  provider.tools = anthropicTools;

  return provider;
}

/**
 * Default Bedrock provider instance.
 */
export const bedrock = createAmazonBedrock();

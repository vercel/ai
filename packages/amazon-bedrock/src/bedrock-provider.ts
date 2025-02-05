import {
  EmbeddingModelV1,
  LanguageModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { BedrockSigningFunction } from './bedrock-api-types';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import {
  BedrockChatModelId,
  BedrockChatSettings,
} from './bedrock-chat-settings';
import { BedrockEmbeddingModel } from './bedrock-embedding-model';
import {
  BedrockEmbeddingModelId,
  BedrockEmbeddingSettings,
} from './bedrock-embedding-settings';
import { createSigV4SigningFunction } from './bedrock-sigv4-signing-function';

export interface AmazonBedrockProviderSettings {
  /**
The AWS region to use for the Bedrock provider.
   */
  region?: string;

  /**
The AWS access key ID to use for the Bedrock provider.
   */
  accessKeyId?: string;

  /**
The AWS secret access key to use for the Bedrock provider.
   */
  secretAccessKey?: string;

  /**
The AWS session token to use for the Bedrock provider.
   */
  sessionToken?: string;

  /**
Complete Bedrock configuration for setting advanced authentication and other
options. When this is provided, the region, accessKeyId, and secretAccessKey
settings are ignored.
   */
  // TODO: review this for backwards-compatibility.
  // https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/Package/-aws-sdk-client-bedrock-runtime/TypeAlias/BedrockRuntimeClientConfigType/
  // bedrockOptions?: BedrockRuntimeClientConfig;

  /**
   * Custom function to generate authentication headers for Bedrock API requests.
   * If not provided, a default signing function will be created using the AWS credentials
   * (region, accessKeyId, secretAccessKey, sessionToken) specified in the provider settings.
   *
   * This can be useful for:
   * - Implementing custom authentication logic
   * - Using alternative credential providers
   * - Testing and mocking authentication
   * - Integrating with custom authentication systems
   */
  signingFunction?: BedrockSigningFunction;

  /**
Base URL for the Bedrock API calls.
   */
  baseURL?: string;

  /**
Custom headers to include in the requests.
   */
  // TODO: integrate this where appropriate.
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
*/
  fetch?: FetchFunction;

  // for testing
  generateId?: () => string;
}

export interface AmazonBedrockProvider extends ProviderV1 {
  (
    modelId: BedrockChatModelId,
    settings?: BedrockChatSettings,
  ): LanguageModelV1;

  languageModel(
    modelId: BedrockChatModelId,
    settings?: BedrockChatSettings,
  ): LanguageModelV1;

  embedding(
    modelId: BedrockEmbeddingModelId,
    settings?: BedrockEmbeddingSettings,
  ): EmbeddingModelV1<string>;
}

/**
Create an Amazon Bedrock provider instance.
 */
export function createAmazonBedrock(
  options: AmazonBedrockProviderSettings = {},
): AmazonBedrockProvider {
  const signingFunction =
    options.signingFunction ??
    createSigV4SigningFunction({
      region: options.region,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      sessionToken: options.sessionToken,
    });

  const getBaseUrl = (): string =>
    withoutTrailingSlash(
      options.baseURL ??
        `https://bedrock-runtime.${loadSetting({
          settingValue: options.region,
          settingName: 'region',
          environmentVariableName: 'AWS_REGION',
          description: 'AWS region',
        })}.amazonaws.com`,
    ) ?? '';

  const createChatModel = (
    modelId: BedrockChatModelId,
    settings: BedrockChatSettings = {},
  ) =>
    new BedrockChatLanguageModel(modelId, settings, {
      baseUrl: getBaseUrl,
      // TODO: likely need to rename the config key below to match the value
      headers: signingFunction,
      generateId,
      fetch: options.fetch,
    });

  const provider = function (
    modelId: BedrockChatModelId,
    settings?: BedrockChatSettings,
  ) {
    if (new.target) {
      throw new Error(
        'The Amazon Bedrock model function cannot be called with the new keyword.',
      );
    }

    return createChatModel(modelId, settings);
  };

  const createEmbeddingModel = (
    modelId: BedrockEmbeddingModelId,
    settings: BedrockEmbeddingSettings = {},
  ) =>
    new BedrockEmbeddingModel(modelId, settings, {
      baseUrl: getBaseUrl,
      headers: signingFunction,
      fetch: options.fetch,
    });

  provider.languageModel = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider as AmazonBedrockProvider;
}

/**
Default Bedrock provider instance.
 */
export const bedrock = createAmazonBedrock();

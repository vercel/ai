import {
  EmbeddingModelV2,
  ImageModelV2,
  LanguageModelV2,
  ProviderV2,
} from '@ai-sdk/provider';
import {
  FetchFunction,
  generateId,
  loadOptionalSetting,
  loadSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import { BedrockChatModelId } from './bedrock-chat-options';
import { BedrockEmbeddingModel } from './bedrock-embedding-model';
import { BedrockEmbeddingModelId } from './bedrock-embedding-options';
import { BedrockImageModel } from './bedrock-image-model';
import { BedrockImageModelId } from './bedrock-image-settings';
import {
  BedrockCredentials,
  createSigV4FetchFunction,
} from './bedrock-sigv4-fetch';

export interface AmazonBedrockProviderSettings {
  /**
The AWS region to use for the Bedrock provider. Defaults to the value of the
`AWS_REGION` environment variable.
   */
  region?: string;

  /**
The AWS access key ID to use for the Bedrock provider. Defaults to the value of the
`AWS_ACCESS_KEY_ID` environment variable.
   */
  accessKeyId?: string;

  /**
The AWS secret access key to use for the Bedrock provider. Defaults to the value of the
`AWS_SECRET_ACCESS_KEY` environment variable.
   */
  secretAccessKey?: string;

  /**
The AWS session token to use for the Bedrock provider. Defaults to the value of the
`AWS_SESSION_TOKEN` environment variable.
   */
  sessionToken?: string;

  /**
Base URL for the Bedrock API calls.
   */
  baseURL?: string;

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
The AWS credential provider to use for the Bedrock provider to get dynamic
credentials similar to the AWS SDK. Setting a provider here will cause its
credential values to be used instead of the `accessKeyId`, `secretAccessKey`,
and `sessionToken` settings.
   */
  credentialProvider?: () => PromiseLike<Omit<BedrockCredentials, 'region'>>;

  // for testing
  generateId?: () => string;
}

export interface AmazonBedrockProvider extends ProviderV2 {
  (modelId: BedrockChatModelId): LanguageModelV2;

  languageModel(modelId: BedrockChatModelId): LanguageModelV2;

  embedding(modelId: BedrockEmbeddingModelId): EmbeddingModelV2<string>;

  /**
Creates a model for image generation.
@deprecated Use `imageModel` instead.
   */
  image(modelId: BedrockImageModelId): ImageModelV2;

  /**
Creates a model for image generation.
   */
  imageModel(modelId: BedrockImageModelId): ImageModelV2;
}

/**
Create an Amazon Bedrock provider instance.
 */
export function createAmazonBedrock(
  options: AmazonBedrockProviderSettings = {},
): AmazonBedrockProvider {
  const sigv4Fetch = createSigV4FetchFunction(async () => {
    const region = loadSetting({
      settingValue: options.region,
      settingName: 'region',
      environmentVariableName: 'AWS_REGION',
      description: 'AWS region',
    });
    // If a credential provider is provided, use it to get the credentials.
    if (options.credentialProvider) {
      return {
        ...(await options.credentialProvider()),
        region,
      };
    }
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
      sessionToken: loadOptionalSetting({
        settingValue: options.sessionToken,
        environmentVariableName: 'AWS_SESSION_TOKEN',
      }),
    };
  }, options.fetch);

  const getBaseUrl = (): string =>
    withoutTrailingSlash(
      options.baseURL ??
        `https://bedrock-runtime.${loadSetting({
          settingValue: options.region,
          settingName: 'region',
          environmentVariableName: 'AWS_REGION',
          description: 'AWS region',
        })}.amazonaws.com`,
    ) ?? `https://bedrock-runtime.us-east-1.amazonaws.com`;

  const createChatModel = (modelId: BedrockChatModelId) =>
    new BedrockChatLanguageModel(modelId, {
      baseUrl: getBaseUrl,
      headers: options.headers ?? {},
      fetch: sigv4Fetch,
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

  const createEmbeddingModel = (modelId: BedrockEmbeddingModelId) =>
    new BedrockEmbeddingModel(modelId, {
      baseUrl: getBaseUrl,
      headers: options.headers ?? {},
      fetch: sigv4Fetch,
    });

  const createImageModel = (modelId: BedrockImageModelId) =>
    new BedrockImageModel(modelId, {
      baseUrl: getBaseUrl,
      headers: options.headers ?? {},
      fetch: sigv4Fetch,
    });

  provider.languageModel = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;
  provider.image = createImageModel;
  provider.imageModel = createImageModel;

  return provider;
}

/**
Default Bedrock provider instance.
 */
export const bedrock = createAmazonBedrock();

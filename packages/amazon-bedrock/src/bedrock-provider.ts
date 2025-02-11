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
import { createSigV4FetchFunction } from './bedrock-sigv4-fetch';

export interface AmazonBedrockProviderSettings {
  /**
The AWS region to use for the Bedrock provider. Defaults to the value of the
`AWS_REGION` environment variable.
   */
  region?: string;

  /**
The AWS access key ID to use for the Bedrock provider. Defaults to the value of the
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
  const sigv4Fetch = createSigV4FetchFunction(
    {
      region: options.region,
      accessKeyId: options.accessKeyId,
      secretAccessKey: options.secretAccessKey,
      sessionToken: options.sessionToken,
    },
    options.fetch,
  );
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

  const createChatModel = (
    modelId: BedrockChatModelId,
    settings: BedrockChatSettings = {},
  ) =>
    new BedrockChatLanguageModel(modelId, settings, {
      baseUrl: getBaseUrl,
      headers: options.headers ?? {},
      fetch: sigv4Fetch,
      generateId,
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
      headers: options.headers ?? {},
      fetch: sigv4Fetch,
    });

  provider.languageModel = createChatModel;
  provider.embedding = createEmbeddingModel;
  provider.textEmbedding = createEmbeddingModel;
  provider.textEmbeddingModel = createEmbeddingModel;

  return provider;
}

/**
Default Bedrock provider instance.
 */
export const bedrock = createAmazonBedrock();

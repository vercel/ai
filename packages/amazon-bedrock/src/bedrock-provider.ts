import {
  EmbeddingModelV1,
  LanguageModelV1,
  ProviderV1,
} from '@ai-sdk/provider';
import {
  generateId,
  loadOptionalSetting,
  loadSetting,
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
import { AwsSigV4Signer } from './bedrock-sigv4-signer';
import { BedrockHeadersFunction } from './bedrock-api-types';

export interface AmazonBedrockProviderSettings {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;

  /**
   * Complete Bedrock configuration for setting advanced authentication and
   * other options. When this is provided, the region, accessKeyId, and
   * secretAccessKey settings are ignored.
   */
  // bedrockOptions?: BedrockRuntimeClientConfig;

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
  const createSigner = () =>
    new AwsSigV4Signer({
      region: loadSetting({
        settingValue: options.region,
        settingName: 'region',
        environmentVariableName: 'AWS_REGION',
        description: 'AWS region',
      }),
      service: 'bedrock',
      credentials: {
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
      },
    });

  const getHeaders: BedrockHeadersFunction = async ({
    url,
    target,
    headers,
    body,
  }) =>
    createSigner().signRequest({
      method: 'POST',
      url,
      headers: {
        ...headers,
        // 'X-Amz-Target': target,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  const createChatModel = (
    modelId: BedrockChatModelId,
    settings: BedrockChatSettings = {},
  ) =>
    new BedrockChatLanguageModel(modelId, settings, {
      // TODO: make baseURL fn-providable so we can load region from env var
      baseUrl: 'https://bedrock-runtime.us-east-2.amazonaws.com',
      headers: getHeaders,
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
      baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      headers: getHeaders,
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

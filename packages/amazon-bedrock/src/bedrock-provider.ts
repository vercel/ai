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
import {
  BedrockRuntimeClient,
  BedrockRuntimeClientConfig,
} from '@aws-sdk/client-bedrock-runtime';
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
  bedrockOptions?: BedrockRuntimeClientConfig;

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
  const createBedrockRuntimeClient = () =>
    new BedrockRuntimeClient(
      options.bedrockOptions ?? {
        region: loadSetting({
          settingValue: options.region,
          settingName: 'region',
          environmentVariableName: 'AWS_REGION',
          description: 'AWS region',
        }),
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
      },
    );

  const createChatModel = (
    modelId: BedrockChatModelId,
    settings: BedrockChatSettings = {},
  ) =>
    new BedrockChatLanguageModel(modelId, settings, {
      client: createBedrockRuntimeClient(),
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
      client: createBedrockRuntimeClient(),
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

import { generateId, loadSetting } from '@ai-sdk/provider-utils';
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import {
  BedrockChatModelId,
  BedrockChatSettings,
} from './bedrock-chat-settings';

export interface AmazonBedrockProviderSettings {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;

  // for testing
  generateId?: () => string;
}

export interface AmazonBedrockProvider {
  (
    modelId: BedrockChatModelId,
    settings?: BedrockChatSettings,
  ): BedrockChatLanguageModel;

  languageModel(
    modelId: BedrockChatModelId,
    settings?: BedrockChatSettings,
  ): BedrockChatLanguageModel;
}

/**
Create an Amazon Bedrock provider instance.
 */
export function createAmazonBedrock(
  options: AmazonBedrockProviderSettings = {},
): AmazonBedrockProvider {
  const createBedrockRuntimeClient = () => {
    const config = {
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
      },
    };

    return new BedrockRuntimeClient(config);
  };

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

  provider.languageModel = createChatModel;

  return provider as AmazonBedrockProvider;
}

/**
Default Bedrock provider instance.
 */
export const bedrock = createAmazonBedrock();

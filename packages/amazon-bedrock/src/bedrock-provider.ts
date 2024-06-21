import { BedrockChatLanguageModel } from './bedrock-chat-language-model';
import {
  BedrockChatModelId,
  BedrockChatSettings,
} from './bedrock-chat-settings';
import { BedrockRuntimeClientConfig } from '@aws-sdk/client-bedrock-runtime';

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
  options: BedrockRuntimeClientConfig = {},
): AmazonBedrockProvider {
  const createChatModel = (
    modelId: BedrockChatModelId,
    settings: BedrockChatSettings = {},
  ) =>
    new BedrockChatLanguageModel(modelId, settings, {
      provider: 'bedrock',
      ...options,
    });

  const provider = function (
    modelId: BedrockChatModelId,
    settings?: BedrockChatSettings,
  ) {
    return createChatModel(modelId, settings);
  };

  provider.languageModel = createChatModel;

  return provider as AmazonBedrockProvider;
}

/**
Default Bedrock provider instance.
 */
export const bedrock = createAmazonBedrock();

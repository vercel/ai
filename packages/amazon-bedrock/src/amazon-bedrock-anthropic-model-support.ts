import type { AmazonBedrockChatModelSettings } from './amazon-bedrock-chat-language-model-options';
import { getAmazonBedrockLanguageModelEntry } from './amazon-bedrock-model-catalog';

export function isAnthropicModel({
  modelId,
  modelFamily,
  reasoningBudgetTokens,
}: {
  modelId: string;
  modelFamily?: AmazonBedrockChatModelSettings['modelFamily'];
  reasoningBudgetTokens?: number;
}): boolean {
  const config =
    getAmazonBedrockLanguageModelEntry(modelId).requestConfig.language;
  return (
    modelFamily === 'anthropic' ||
    config.anthropic ||
    (config.applicationInferenceProfile && reasoningBudgetTokens != null)
  );
}

export function supportsStrictTools(modelId: string): boolean {
  return getAmazonBedrockLanguageModelEntry(modelId).capabilities.language.tools
    .strict;
}

export function supportsNativeStructuredOutput(modelId: string): boolean {
  return getAmazonBedrockLanguageModelEntry(modelId).capabilities.language
    .structuredOutput.native;
}

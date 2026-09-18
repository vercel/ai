import type { AmazonBedrockChatModelSettings } from './bedrock-chat-options';

export function isAnthropicModel({
  modelId,
  modelFamily,
  reasoningBudgetTokens,
}: {
  modelId: string;
  modelFamily?: AmazonBedrockChatModelSettings['modelFamily'];
  reasoningBudgetTokens?: number;
}): boolean {
  return (
    modelFamily === 'anthropic' ||
    modelId.includes('anthropic') ||
    (modelId.includes(':application-inference-profile/') &&
      reasoningBudgetTokens != null)
  );
}

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

// Keep the existing Claude 4 policy; Claude 5 native output does not require thinking.
export function supportsClaude5NativeStructuredOutput(
  modelId: string,
): boolean {
  return /claude-(?:(?:opus|sonnet)-5(?:-5)?|haiku-5-5)(?:-\d{8})?(?:-v\d+)?(?=[:.]|$)/.test(
    modelId,
  );
}

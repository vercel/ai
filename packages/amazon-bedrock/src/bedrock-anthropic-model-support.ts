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

// Bedrock validates its own Messages schema. New Claude generations currently
// reject native structured output and strict tools, so only known supported
// Claude models receive those fields. Non-Claude models and opaque inference
// profile IDs retain their existing behavior.
export function supportsStrictTools(modelId: string): boolean {
  return (
    !modelId.includes('claude-') ||
    LEGACY_CLAUDE_PATTERN.test(modelId) ||
    MODELS_WITH_STRICT_TOOL_SUPPORT.some(pattern => pattern.test(modelId))
  );
}

export function supportsNativeStructuredOutput(modelId: string): boolean {
  return (
    supportsStrictTools(modelId) &&
    !/claude-(?:sonnet-4-6|haiku-4-5)(?=[-.:]|$)/.test(modelId)
  );
}

const LEGACY_CLAUDE_PATTERN = /claude-(?:instant|v?2|3)(?=[-.:]|$)/;

const MODELS_WITH_STRICT_TOOL_SUPPORT = [
  // Original Claude 4 IDs include a release date instead of a minor version.
  /claude-(?:opus|sonnet)-4(?:-\d{8})?(?:-v\d+)?(?=[:.]|$)/,
  /claude-opus-4-(?:1|5|6)(?=[-.:]|$)/,
  /claude-sonnet-4-(?:5|6)(?=[-.:]|$)/,
  /claude-haiku-4-5(?=[-.:]|$)/,
];

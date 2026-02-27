export type XaiChatModelCapabilities = {
  isReasoningModel: boolean;
  isGrokThreeModel: boolean;
};

export function getXaiChatModelCapabilities(
  modelId: string,
): XaiChatModelCapabilities {
  const isExplicitNonReasoningModel = modelId.includes('-non-reasoning');

  const isReasoningModel =
    !isExplicitNonReasoningModel &&
    (modelId.includes('-reasoning') ||
      modelId.startsWith('grok-4') ||
      modelId.startsWith('grok-3-mini') ||
      modelId.startsWith('grok-code-fast-1'));
  const isGrokThreeModel =
    modelId.startsWith('grok-3') && !modelId.startsWith('grok-3-mini');

  return {
    isReasoningModel,
    isGrokThreeModel,
  };
}

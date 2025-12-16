export type OpenAILanguageModelCapabilities = {
  isReasoningModel: boolean;
  systemMessageMode: 'remove' | 'system' | 'developer';
  supportsFlexProcessing: boolean;
  supportsPriorityProcessing: boolean;

  /**
   * Allow temperature, topP, logProbs when reasoningEffort is none.
   */
  supportsNonReasoningParameters: boolean;
};

export function getOpenAILanguageModelCapabilities(
  modelId: string,
): OpenAILanguageModelCapabilities {
  const supportsFlexProcessing =
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini') ||
    (modelId.startsWith('gpt-5') && !modelId.startsWith('gpt-5-chat'));

  const supportsPriorityProcessing =
    modelId.startsWith('gpt-4') ||
    modelId.startsWith('gpt-5-mini') ||
    (modelId.startsWith('gpt-5') &&
      !modelId.startsWith('gpt-5-nano') &&
      !modelId.startsWith('gpt-5-chat')) ||
    modelId.startsWith('o3') ||
    modelId.startsWith('o4-mini');

  const isReasoningModel = !(
    modelId.startsWith('gpt-3') ||
    modelId.startsWith('gpt-4') ||
    modelId.startsWith('chatgpt-4o') ||
    modelId.startsWith('gpt-5-chat')
  );

  // https://platform.openai.com/docs/guides/latest-model#gpt-5-1-parameter-compatibility
  // GPT-5.1 and GPT-5.2 support temperature, topP, logProbs when reasoningEffort is none
  const supportsNonReasoningParameters =
    modelId.startsWith('gpt-5.1') || modelId.startsWith('gpt-5.2');

  const systemMessageMode = isReasoningModel ? 'developer' : 'system';

  return {
    supportsFlexProcessing,
    supportsPriorityProcessing,
    isReasoningModel,
    systemMessageMode,
    supportsNonReasoningParameters,
  };
}

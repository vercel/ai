export type MoonshotAILanguageModelCapabilities = {
  supportsStructuredOutputs: boolean;
};

export function getMoonshotAILanguageModelCapabilities(
  modelId: string,
): MoonshotAILanguageModelCapabilities {
  return {
    supportsStructuredOutputs: modelId.startsWith('kimi-'),
  };
}

/**
 * Checks if the model is a reasoning model that outputs <think> sections
 */
export function isReasoningModel(modelId: string): boolean {
  const reasoningModels = [
    'sonar-deep-research',
    'sonar-reasoning-pro',
    'sonar-reasoning',
  ];
  return reasoningModels.includes(modelId);
}

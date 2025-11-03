export function isReasoningModel(modelId: string) {
  if (modelId.startsWith('gpt-3')) return false;
  if (modelId.startsWith('gpt-4')) return false;
  if (modelId.startsWith('chatgpt-4o')) return false;
  if (modelId.startsWith('gpt-5-chat')) return false;

  return true;
}
export function isReasoningModel(modelId: string) {
  const result = funk(modelId);
  console.log(`isReasoningModel(${modelId}) => ${result}`);
  return result;
}

function funk(modelId: string) {
  if (modelId.startsWith('gpt-4o')) return false;
  if (modelId.startsWith('chatgpt-4o')) return false;
  if (modelId.startsWith('codex')) return true;
  if (modelId.startsWith('computer-use')) return true;

  if (modelId.startsWith('gpt-4')) return false;
  if (modelId.startsWith('gpt-3')) return false;
  if (modelId.startsWith('gpt-5-chat')) return false;

  return true;
}
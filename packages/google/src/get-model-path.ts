export function getModelPath(modelId: string): string {
  if (modelId.startsWith('google/')) {
    return `models/${modelId}`;
  }
  return modelId.includes('/') ? modelId : `models/${modelId}`;
}

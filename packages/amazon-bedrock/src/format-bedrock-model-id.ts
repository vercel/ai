export function formatBedrockModelId(modelId: string): string {
  const encodedModelId = encodeURIComponent(modelId);

  if (!/^arn:aws(?:-[^:]+)?:bedrock:/.test(modelId)) {
    return encodedModelId;
  }

  return encodedModelId.replace(/%3A/gi, ':').replace(/%2F/gi, '/');
}

/**
 * Parses a Vertex AI model ID that may include a publisher prefix.
 *
 * @example
 * parseVertexModelId('gemini-2.5-pro') // { publisher: 'google', modelName: 'gemini-2.5-pro' }
 * parseVertexModelId('zai-org/glm-4.7-maas') // { publisher: 'zai-org', modelName: 'glm-4.7-maas' }
 */
export function parseVertexModelId(modelId: string): {
  publisher: string;
  modelName: string;
} {
  const parts = modelId.split('/');

  if (parts.length === 2) {
    return { publisher: parts[0], modelName: parts[1] };
  }

  return { publisher: 'google', modelName: modelId };
}

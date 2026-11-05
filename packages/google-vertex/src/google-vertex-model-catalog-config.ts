export type VertexRequestConfig = {
  language?: { endpoint: boolean; maxOutputTokens?: number };
  image?: { gemini: boolean };
  embedding?: {
    endpoint: 'embedContent' | 'predict';
    maxEmbeddingsPerCall: number;
  };
  speech?: { api: 'cloud-tts' | 'gemini' };
  transcription?: { api: 'gemini' | 'cloud-speech'; live: boolean };
};

function requestConfig(modelId: string): VertexRequestConfig {
  const embedContent =
    modelId === 'gemini-embedding-2' ||
    modelId === 'gemini-embedding-2-preview';
  return {
    language: {
      endpoint: modelId.startsWith('endpoints/'),
      maxOutputTokens:
        modelId === 'meta/llama-4-maverick-17b-128e-instruct-maas' ||
        modelId === 'meta/llama-4-scout-17b-16e-instruct-maas'
          ? 8192
          : undefined,
    },
    image: { gemini: modelId.startsWith('gemini-') },
    embedding: {
      endpoint: embedContent ? 'embedContent' : 'predict',
      maxEmbeddingsPerCall: embedContent ? 1 : 250,
    },
    speech: { api: modelId.startsWith('chirp') ? 'cloud-tts' : 'gemini' },
    transcription: {
      api: modelId.startsWith('gemini') ? 'gemini' : 'cloud-speech',
      live: modelId.includes('-live'),
    },
  };
}

export function getGoogleVertexRequestConfig(
  modelId: string,
): VertexRequestConfig {
  return requestConfig(modelId);
}

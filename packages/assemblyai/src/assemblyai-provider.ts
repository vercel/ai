import { TranscriptionModelV1, ProviderV1 } from '@ai-sdk/provider';
import { FetchFunction, loadApiKey } from '@ai-sdk/provider-utils';
import { AssemblyAITranscriptionModel } from './assemblyai-transcription-model';
import { AssemblyAITranscriptionModelId } from './assemblyai-transcription-settings';

export interface AssemblyAIProvider
  extends Pick<ProviderV1, 'transcriptionModel'> {
  (
    modelId: 'best',
    settings?: {},
  ): {
    transcription: AssemblyAITranscriptionModel;
  };

  /**
Creates a model for transcription.
   */
  transcription(modelId: AssemblyAITranscriptionModelId): TranscriptionModelV1;
}

export interface AssemblyAIProviderSettings {
  /**
API key for authenticating requests.
     */
  apiKey?: string;

  /**
Custom headers to include in the requests.
     */
  headers?: Record<string, string>;

  /**
Custom fetch implementation. You can use it as a middleware to intercept requests,
or to provide a custom fetch implementation for e.g. testing.
    */
  fetch?: FetchFunction;
}

/**
Create an AssemblyAI provider instance.
 */
export function createAssemblyAI(
  options: AssemblyAIProviderSettings = {},
): AssemblyAIProvider {
  const getHeaders = () => ({
    authorization: loadApiKey({
      apiKey: options.apiKey,
      environmentVariableName: 'ASSEMBLYAI_API_KEY',
      description: 'AssemblyAI',
    }),
    ...options.headers,
  });

  const createTranscriptionModel = (modelId: AssemblyAITranscriptionModelId) =>
    new AssemblyAITranscriptionModel(modelId, {
      provider: `assemblyai.transcription`,
      url: ({ path }) => `https://api.assemblyai.com${path}`,
      headers: getHeaders,
      fetch: options.fetch,
    });

  const provider = function (modelId: AssemblyAITranscriptionModelId) {
    return {
      transcription: createTranscriptionModel(modelId),
    };
  };

  provider.transcription = createTranscriptionModel;
  provider.transcriptionModel = createTranscriptionModel;

  return provider as AssemblyAIProvider;
}

/**
Default AssemblyAI provider instance.
 */
export const assemblyai = createAssemblyAI();

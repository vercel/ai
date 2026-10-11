import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { azureMaiTranscriptionModelOptionsShape } from './azure-mai-transcription-model-options';
import { azureSpeechTranscriptionModelOptionsShape } from './azure-speech-transcription-model-options';

export const azureTranscriptionModelOptions = lazySchema(() =>
  zodSchema(
    z.strictObject({
      /**
       * API to use. Defaults to Speech for MAI-Transcribe models, MAI for
       * MAI-Transcribe-2-Streaming, and OpenAI otherwise.
       */
      api: z.enum(['openai', 'speech', 'mai']).optional(),
      ...azureSpeechTranscriptionModelOptionsShape(),
      ...azureMaiTranscriptionModelOptionsShape(),
    }),
  ),
);

export type AzureTranscriptionModelOptions = InferSchema<
  typeof azureTranscriptionModelOptions
>;

// Azure Speech model names by lowercase model ID. MAI-Transcribe-1.5 only
// accepts Azure's default timestamps (`none`).
const maiTranscribeModels = new Map([
  ['mai-transcribe-2', { name: 'MAI-Transcribe-2', supportsTimestamps: true }],
  [
    'mai-transcribe-1.5',
    { name: 'MAI-Transcribe-1.5', supportsTimestamps: false },
  ],
]);

export function getMAITranscribeModel(modelId: string) {
  return maiTranscribeModels.get(modelId.toLowerCase());
}

export function isMAITranscribeStreaming(modelId: string): boolean {
  return modelId.toLowerCase() === 'mai-transcribe-2-streaming';
}

import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { azureSpeechTranscriptionModelOptionsShape } from './azure-speech-transcription-model-options';

export const azureTranscriptionModelOptions = lazySchema(() =>
  zodSchema(
    z.strictObject({
      /**
       * API to use. Defaults to Speech for MAI-Transcribe models, OpenAI otherwise.
       */
      api: z.enum(['openai', 'speech']).optional(),
      ...azureSpeechTranscriptionModelOptionsShape(),
    }),
  ),
);

export type AzureTranscriptionModelOptions = InferSchema<
  typeof azureTranscriptionModelOptions
>;

// Azure Speech model names by lowercase model ID. MAI-Transcribe-1.x only
// accepts Azure's default timestamps (`none`).
const maiTranscribeModels = new Map([
  ['mai-transcribe-2', { name: 'MAI-Transcribe-2', supportsTimestamps: true }],
  [
    'mai-transcribe-1.5',
    { name: 'MAI-Transcribe-1.5', supportsTimestamps: false },
  ],
  ['mai-transcribe-1', { name: 'MAI-Transcribe-1', supportsTimestamps: false }],
]);

export function getMAITranscribeModel(modelId: string) {
  return maiTranscribeModels.get(modelId.toLowerCase());
}

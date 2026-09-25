import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { azureSpeechTranscriptionModelOptionsShape } from './azure-speech-transcription-model-options';

export const azureTranscriptionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * API to use. Defaults to Speech for MAI-Transcribe-2, OpenAI otherwise.
       */
      api: z.enum(['openai', 'speech']).optional(),
      ...azureSpeechTranscriptionModelOptionsShape(),
    }),
  ),
);

export type AzureTranscriptionModelOptions = InferSchema<
  typeof azureTranscriptionModelOptions
>;

export function isMAITranscribe2(modelId: string): boolean {
  return modelId.toLowerCase() === 'mai-transcribe-2';
}

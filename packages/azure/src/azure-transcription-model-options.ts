import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { getAzureModelEntry } from './azure-model-catalog';
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

export function getMAITranscribeModel(modelId: string) {
  const config = getAzureModelEntry(modelId)?.requestConfig?.transcription;
  return config?.api === 'speech'
    ? { name: config.name, supportsTimestamps: config.supportsTimestamps }
    : undefined;
}

export function isMAITranscribeStreaming(modelId: string): boolean {
  return (
    getAzureModelEntry(modelId)?.requestConfig?.transcription?.api === 'mai'
  );
}

import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const azureTranscriptionModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /** API to use. Defaults to Speech for MAI-Transcribe-2, OpenAI otherwise. */
      api: z.enum(['openai', 'speech']).optional(),
      /** Speech timestamp granularity. Defaults to segment. */
      timestamps: z.enum(['word', 'segment', 'none']).optional(),
      /** Speech transcript style. Defaults to verbatim. */
      transcribeStyle: z.enum(['verbatim', 'clean']).optional(),
      /** Force a single language. Omit for automatic language detection. */
      locales: z.array(z.string()).length(1).optional(),
      diarization: z.object({ enabled: z.boolean() }).optional(),
      phraseList: z.object({ phrases: z.array(z.string()) }).optional(),
    }),
  ),
);

export type AzureTranscriptionModelOptions = InferSchema<
  typeof azureTranscriptionModelOptions
>;

export function isMAITranscribe2(modelId: string): boolean {
  return modelId.toLowerCase() === 'mai-transcribe-2';
}

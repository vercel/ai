import { InferSchema, lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type OpenAISpeechModelId =
  | 'tts-1'
  | 'tts-1-hd'
  | 'gpt-4o-mini-tts'
  | (string & {});

// https://platform.openai.com/docs/api-reference/audio/createSpeech
export const openaiSpeechProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      instructions: z.string().nullish(),
      speed: z.number().min(0.25).max(4.0).default(1.0).nullish(),
    }),
  ),
);

export type OpenAISpeechCallOptions = InferSchema<
  typeof openaiSpeechProviderOptionsSchema
>;

import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { FAL_EMOTIONS, FAL_LANGUAGE_BOOSTS } from './fal-api-types';

export const falSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.looseObject({
      voice_setting: z
        .object({
          speed: z.number().nullish(),
          vol: z.number().nullish(),
          voice_id: z.string().nullish(),
          pitch: z.number().nullish(),
          english_normalization: z.boolean().nullish(),
          emotion: z.enum(FAL_EMOTIONS).nullish(),
        })
        .partial()
        .nullish(),
      audio_setting: z.record(z.string(), z.unknown()).nullish(),
      language_boost: z.enum(FAL_LANGUAGE_BOOSTS).nullish(),
      pronunciation_dict: z.record(z.string(), z.string()).nullish(),
    }),
  ),
);

export type FalSpeechModelOptions = InferSchema<
  typeof falSpeechModelOptionsSchema
>;

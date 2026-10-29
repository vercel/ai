import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type MistralSpeechModelId =
  | 'voxtral-mini-tts-2603'
  | 'voxtral-mini-tts-3-0'
  | 'voxtral-mini-tts-3'
  | 'voxtral-mini-tts-latest'
  | (string & {});

export const mistralSpeechModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Base64-encoded reference audio for one-off voice cloning.
       *
       * When provided, this takes precedence over the standard `voice` option.
       */
      refAudio: z.string().min(1).optional(),

      /**
       * How expressive the speech is, from 1 to 5. Higher values trade voice
       * similarity and stability for stronger delivery. Supported by Voxtral 3.
       */
      expressiveness: z.number().min(1).max(5).optional(),

      /**
       * Pronunciation hints mapping words to lists of IPA phonemes.
       * Supported by Voxtral 3.
       */
      phonemeHints: z
        .record(z.string().min(1), z.array(z.string().min(1)).min(1))
        .optional(),
    }),
  ),
);

export type MistralSpeechModelOptions = InferSchema<
  typeof mistralSpeechModelOptions
>;

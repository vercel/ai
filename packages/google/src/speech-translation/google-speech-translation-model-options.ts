import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GoogleModelIds } from '../google-model-catalog';

export type GoogleSpeechTranslationModelId =
  | GoogleModelIds['speechTranslation']
  | (string & {});

export const googleSpeechTranslationModelOptions = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Whether input audio already in the target language should be echoed
       * instead of producing silence.
       */
      echoTargetLanguage: z.boolean().optional(),
    }),
  ),
);

export type GoogleSpeechTranslationModelOptions = InferSchema<
  typeof googleSpeechTranslationModelOptions
>;

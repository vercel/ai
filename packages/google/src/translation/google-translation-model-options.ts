import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type GoogleTranslationModelId =
  | 'gemini-3.5-live-translate-preview'
  | (string & {});

export const googleTranslationModelOptions = lazySchema(() =>
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

export type GoogleTranslationModelOptions = InferSchema<
  typeof googleTranslationModelOptions
>;

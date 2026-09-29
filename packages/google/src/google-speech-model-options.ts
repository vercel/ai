import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type GoogleSpeechModelId =
  | 'gemini-2.5-flash-preview-tts'
  | 'gemini-2.5-pro-preview-tts'
  | 'gemini-3.1-flash-tts-preview'
  | 'gemini-3.8-flash-tts'
  | 'gemini-3.8-flash-lite-tts'
  | (string & {});

const prebuiltVoiceConfigSchema = z.object({
  voiceName: z.string(),
});

const voiceConfigSchema = z.object({
  prebuiltVoiceConfig: prebuiltVoiceConfigSchema,
  voice: z.never().optional(),
});

const speechMetadataSchema = z.object({
  speaker: z.string().min(1).optional(),
  style: z.string().optional(),
});

export const googleSpeechProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Turn-level directions for the top-level text, for Gemini 3.8 TTS. */
      speechMetadata: speechMetadataSchema.optional(),

      /**
       * Structured transcript for Gemini 3.8 TTS. Replaces the top-level text;
       * pass text: '' when using turns. Each multi-speaker turn must name a
       * configured speaker in speechMetadata. Per-turn styles override instructions.
       */
      turns: z
        .array(
          z.object({
            text: z.string(),
            speechMetadata: speechMetadataSchema.optional(),
          }),
        )
        .min(1)
        .optional(),

      /**
       * Multi-speaker configuration for dialogue audio. When provided, this
       * overrides the top-level `voice`. The Gemini TTS API supports up to two
       * speakers. For Gemini 3.8, each turn's speechMetadata.speaker must match
       * a configured speaker; older models use speaker labels in the text.
       *
       * https://ai.google.dev/gemini-api/docs/speech-generation#multi-speaker
       */
      multiSpeakerVoiceConfig: z
        .object({
          speakerVoiceConfigs: z.array(
            z.object({
              speaker: z.string(),
              voiceConfig: voiceConfigSchema,
            }),
          ),
        })
        .optional(),
    }),
  ),
);

export type GoogleSpeechModelOptions = InferSchema<
  typeof googleSpeechProviderOptionsSchema
>;

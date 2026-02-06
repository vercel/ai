import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export type GoogleGenerativeAISpeechModelId =
  | 'gemini-2.5-pro-preview-tts'
  | 'gemini-2.5-flash-preview-tts'
  | (string & {});

const voiceConfigSchema = z.object({
  prebuiltVoiceConfig: z
    .object({
      voiceName: z.string(),
    })
    .nullish(),
  replicatedVoiceConfig: z
    .object({
      mimeType: z.string().nullish(),
      voiceSampleAudio: z.string(),
    })
    .nullish(),
});

export const googleSpeechProviderOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /**
       * Voice cloning configuration. Use this to clone a voice from an audio sample.
       * Mutually exclusive with using the `voice` parameter for prebuilt voices.
       */
      replicatedVoiceConfig: z
        .object({
          mimeType: z.string().nullish(),
          voiceSampleAudio: z.string(),
        })
        .nullish(),

      /**
       * Multi-speaker configuration for generating speech with multiple voices.
       * Mutually exclusive with single voice configuration.
       * Requires exactly 2 speakers. Speaker names must match labels in the text
       * (e.g., "[Alice] Hello! [Bob] Hi there!").
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
        .nullish(),
    }),
  ),
);

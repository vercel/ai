import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Schema for camelCase input from users
export const elevenLabsSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      languageCode: z.string().optional(),
      voiceSettings: z
        .object({
          stability: z.number().min(0).max(1).optional(),
          similarityBoost: z.number().min(0).max(1).optional(),
          style: z.number().min(0).max(1).optional(),
          useSpeakerBoost: z.boolean().optional(),
        })
        .optional(),
      pronunciationDictionaryLocators: z
        .array(
          z.object({
            pronunciationDictionaryId: z.string(),
            versionId: z.string().optional(),
          }),
        )
        .max(3)
        .optional(),
      seed: z.number().min(0).max(4294967295).optional(),
      previousText: z.string().optional(),
      nextText: z.string().optional(),
      previousRequestIds: z.array(z.string()).max(3).optional(),
      nextRequestIds: z.array(z.string()).max(3).optional(),
      applyTextNormalization: z.enum(['auto', 'on', 'off']).optional(),
      applyLanguageTextNormalization: z.boolean().optional(),
      enableLogging: z.boolean().optional(),
      // https://elevenlabs.io/docs/api-reference/text-to-speech/v-1-text-to-speech-voice-id-stream-input
      streaming: z
        .object({
          autoMode: z.boolean().optional(),
          chunkLengthSchedule: z
            .array(z.number().min(50).max(500))
            .min(1)
            .optional(),
          enableSsmlParsing: z.boolean().optional(),
          inactivityTimeout: z.number().int().min(1).max(180).optional(),
          // Native output_format (e.g. mp3_44100_192), overriding outputFormat.
          outputFormat: z.string().min(1).optional(),
          syncAlignment: z.boolean().optional(),
        })
        .optional(),
      // https://elevenlabs.io/docs/api-reference/text-to-dialogue/ttd-websocket
      dialogue: z
        .object({
          voices: z.array(z.string().min(1)).min(1).max(10),
          voiceSettings: z
            .object({ stability: z.number().min(0).max(1).optional() })
            .optional(),
        })
        .optional(),
      // https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert
      inputs: z
        .array(
          z.object({
            text: z.string().min(1),
            voiceId: z.string().min(1),
          }),
        )
        .min(1)
        .optional(),
      // https://elevenlabs.io/docs/api-reference/music/compose
      musicLengthMs: z.number().int().min(3000).max(600000).optional(),
      forceInstrumental: z.boolean().optional(),
      // Native composition_plan, sent as-is in place of the text prompt.
      compositionPlan: z.record(z.string(), z.unknown()).optional(),
      // https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert
      durationSeconds: z.number().min(0.5).max(30).optional(),
      promptInfluence: z.number().min(0).max(1).optional(),
      loop: z.boolean().optional(),
    }),
  ),
);

export type ElevenLabsSpeechModelOptions = InferSchema<
  typeof elevenLabsSpeechModelOptionsSchema
>;

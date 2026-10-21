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
          // Uses the multi-context WebSocket with this single context id.
          contextId: z.string().min(1).optional(),
          chunkLengthSchedule: z
            .array(z.number().min(50).max(500))
            .min(1)
            .optional(),
          enableSsmlParsing: z.boolean().optional(),
          inactivityTimeout: z.number().int().min(1).max(180).optional(),
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
    }),
  ),
);

export type ElevenLabsSpeechModelOptions = InferSchema<
  typeof elevenLabsSpeechModelOptionsSchema
>;

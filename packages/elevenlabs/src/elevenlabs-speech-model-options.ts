import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// Native (snake_case) composition plans, sent as-is in place of the prompt.
// https://elevenlabs.io/docs/api-reference/music/compose
function compositionPlanSchema() {
  const timeRange = z.object({
    start_ms: z.number().int().min(0),
    end_ms: z.number().int().min(0),
  });
  const audioRefChunk = z.object({ song_id: z.string(), range: timeRange });
  const durationMs = z.number().int().min(3000).max(120000);
  const styles = z.array(z.string());

  // music_v1
  const musicPrompt = z.object({
    positive_global_styles: styles,
    negative_global_styles: styles,
    sections: z.array(
      z.object({
        section_name: z.string().min(1).max(100),
        positive_local_styles: styles,
        negative_local_styles: styles,
        duration_ms: durationMs,
        lines: z.array(z.string().max(200)).max(30),
        source_from: z
          .object({
            song_id: z.string(),
            range: timeRange,
            negative_ranges: z.array(timeRange).optional(),
          })
          .nullish(),
      }),
    ),
  });

  // music_v2 and later
  const generationChunk = z.object({
    text: z.string(),
    duration_ms: durationMs,
    positive_styles: styles,
    negative_styles: styles.optional(),
    context_adherence: z.enum(['low', 'medium', 'high']).optional(),
    conditioning_ref: audioRefChunk.nullish(),
    condition_strength: z.enum(['low', 'medium', 'high', 'xhigh']).nullish(),
  });
  const chunkedPlan = z.object({
    chunks: z.array(z.union([generationChunk, audioRefChunk])),
  });

  return z.union([musicPrompt, chunkedPlan]);
}

// Schema for camelCase input from users
export const elevenLabsSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Return speech character alignment or music lyric word timestamps. */
      withTimestamps: z.boolean().optional(),
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
      compositionPlan: compositionPlanSchema().optional(),
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

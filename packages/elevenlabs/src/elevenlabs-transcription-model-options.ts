import { z } from 'zod/v4';

// https://elevenlabs.io/docs/api-reference/speech-to-text/convert
export const elevenLabsTranscriptionModelOptionsSchema = z.object({
  languageCode: z.string().nullish(),
  tagAudioEvents: z.boolean().nullish().default(true),
  numSpeakers: z.number().int().min(1).max(32).nullish(),
  timestampsGranularity: z
    .enum(['none', 'word', 'character'])
    .nullish()
    .default('word'),
  diarize: z.boolean().nullish().default(false),
  fileFormat: z.enum(['pcm_s16le_16', 'other']).nullish().default('other'),
  streaming: z
    .object({
      commitStrategy: z.enum(['manual', 'vad']).optional(),
      enableLogging: z.boolean().optional(),
      filterBackgroundAudio: z.boolean().optional(),
      includeLanguageDetection: z.boolean().optional(),
      includeTimestamps: z.boolean().optional(),
      keyterms: z.array(z.string().max(20)).max(50).optional(),
      minSilenceDurationMs: z.number().int().min(50).max(2000).optional(),
      minSpeechDurationMs: z.number().int().min(50).max(2000).optional(),
      noVerbatim: z.boolean().optional(),
      previousText: z.string().optional(),
      vadSilenceThresholdSecs: z.number().min(0.3).max(3).optional(),
      vadThreshold: z.number().min(0.1).max(0.9).optional(),
    })
    .optional(),
});

export type ElevenLabsTranscriptionModelOptions = z.infer<
  typeof elevenLabsTranscriptionModelOptionsSchema
>;

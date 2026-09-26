import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const minimaxSpeechProviderOptions = z.object({
  /** Additional voice controls. */
  voiceSetting: z
    .object({
      volume: z.number().positive().max(10).optional(),
      pitch: z.number().int().min(-12).max(12).optional(),
      emotion: z
        .enum([
          'happy',
          'sad',
          'angry',
          'fearful',
          'disgusted',
          'surprised',
          'calm',
          'fluent',
          'whisper',
        ])
        .optional(),
    })
    .optional(),

  /** Audio encoding controls. */
  audioSetting: z
    .object({
      sampleRate: z
        .union([
          z.literal(8000),
          z.literal(16000),
          z.literal(22050),
          z.literal(24000),
          z.literal(32000),
          z.literal(44100),
        ])
        .optional(),
      bitrate: z
        .union([
          z.literal(32000),
          z.literal(64000),
          z.literal(128000),
          z.literal(256000),
        ])
        .optional(),
      channel: z.union([z.literal(1), z.literal(2)]).optional(),
    })
    .optional(),

  /** Pronunciation replacements in `original/replacement` format. */
  pronunciationDictionary: z
    .object({
      tone: z.array(z.string()),
    })
    .optional(),

  /** Language or dialect to prioritize, or `auto` for automatic detection. */
  languageBoost: z.string().optional(),

  /** Post-processing controls for the generated voice. */
  voiceModify: z
    .object({
      pitch: z.number().int().min(-100).max(100).optional(),
      intensity: z.number().int().min(-100).max(100).optional(),
      timbre: z.number().int().min(-100).max(100).optional(),
      soundEffect: z
        .enum(['spacious_echo', 'auditorium_echo', 'lofi_telephone', 'robotic'])
        .optional(),
    })
    .optional(),

  /** Whether the service should generate subtitle metadata. */
  subtitleEnable: z.boolean().optional(),
});

export type MiniMaxSpeechModelOptions = z.infer<
  typeof minimaxSpeechProviderOptions
>;

export const minimaxSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(minimaxSpeechProviderOptions),
);

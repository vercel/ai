import { z } from 'zod/v4';

export type MinimaxSpeechModelId =
  | 'speech-2.8-hd'
  | 'speech-2.8-turbo'
  | 'speech-2.6-hd'
  | 'speech-2.6-turbo'
  | 'speech-02-hd'
  | 'speech-02-turbo'
  | 'speech-01-hd'
  | 'speech-01-turbo'
  | (string & {});

export const minimaxSpeechProviderOptions = z.object({
  voice_setting: z
    .object({
      voice_id: z.string(),
      speed: z.number().min(0.5).max(2).default(1).optional(),
      vol: z.number().min(1).max(10).default(1).optional(),
      pitch: z.number().min(-12).max(12).default(0).optional(),
      emotion: z
        .union([
          z.literal('happy'),
          z.literal('sad'),
          z.literal('angry'),
          z.literal('fearful'),
          z.literal('disgusted'),
          z.literal('surprised'),
          z.literal('calm'),
          z.literal('fluent'),
          z.literal('whisper'),
        ])
        .optional(),
      text_normalization: z.boolean().default(false).optional(),
      latex_read: z.boolean().default(false).optional(),
    })
    .optional(),
  audio_setting: z
    .object({
      sample_rate: z.number().optional(),
      bitrate: z.number().optional(),
      format: z
        .union([
          z.literal('mp3'),
          z.literal('pcm'),
          z.literal('flac'),
          z.literal('wav'),
          z.literal('pcmu_raw'),
          z.literal('pcmu_wav'),
          z.literal('opus'),
        ])
        .optional(),
      channel: z.number().min(1).max(2).default(1).optional(),
      force_cbr: z.boolean().default(false).optional(),
    })
    .optional(),
  timbre_weights: z
    .object({
      voice_id: z.string().optional(),
      weight: z.number().min(0).max(100).optional(),
    })
    .optional(),
  language_boost: z
    .union([
      z.literal('Chinese'),
      z.literal('English'),
      z.literal('Arabic'),
      z.literal('Russian'),
      z.literal('Spanish'),
      z.literal('French'),
      z.literal('Portuguese'),
      z.literal('German'),
      z.literal('Turkish'),
      z.literal('Dutch'),
      z.literal('Ukrainian'),
      z.literal('Vietnamese'),
      z.literal('Indonesian'),
      z.literal('Japanese'),
      z.literal('Italian'),
      z.literal('Korean'),
      z.literal('Thai'),
      z.literal('Polish'),
      z.literal('Romanian'),
      z.literal('Greek'),
      z.literal('Czech'),
      z.literal('Finnish'),
      z.literal('Hindi'),
      z.literal('Bulgarian'),
      z.literal('Danish'),
      z.literal('Hebrew'),
      z.literal('Malay'),
      z.literal('Persian'),
      z.literal('Slovak'),
      z.literal('Swedish'),
      z.literal('Croatian'),
      z.literal('Filipino'),
      z.literal('Hungarian'),
      z.literal('Norwegian'),
      z.literal('Slovenian'),
      z.literal('Catalan'),
      z.literal('Nynorsk'),
      z.literal('Tamil'),
      z.literal('Afrikaans'),
      z.literal('auto'),
    ])
    .default('auto')
    .optional(),
  voice_modify: z
    .object({
      pitch: z.number().min(-100).max(100).optional(),
      intensity: z.number().min(-100).max(100).optional(),
      timbre: z.number().min(-100).max(100).optional(),
      sound_effects: z
        .union([
          z.literal('spacious_echo'),
          z.literal('auditorium_echo'),
          z.literal('lofi_telephone'),
          z.literal('robotic'),
        ])
        .optional(),
    })
    .optional(),
  subtitle_enable: z.boolean().default(false).optional(),
  subtitle_type: z.union([z.literal('sentence'), z.literal('word')]).optional(),
  output_format: z
    .union([z.literal('url'), z.literal('hex')])
    .default('hex')
    .optional(),
});

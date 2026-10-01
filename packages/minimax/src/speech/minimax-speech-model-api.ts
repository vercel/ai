import { lazySchema, zodSchema } from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export const minimaxSpeechModelResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      data: z
        .object({
          audio: z.string(),
          status: z.number(),
          subtitle_file: z.string().optional(),
        })
        .nullish(),
      trace_id: z.string(),
      extra_info: z.object({
        audio_length: z.number(),
        audio_sample_rate: z.number(),
        audio_size: z.number(),
        bitrate: z.number(),
        audio_format: z.union([
          z.literal('mp3'),
          z.literal('pcm'),
          z.literal('flac'),
        ]),
        audio_channel: z.number(),
        invisible_character_ratio: z.number(),
        usage_characters: z.number(),
        usage_voice_count: z.number(),
        word_count: z.number(),
      }),
      base_resp: z.object({
        status_code: z.number(),
        status_msg: z.string(),
      }),
    }),
  ),
);

export const minimaxErrorResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      type: z.string(),
      error: z.object({
        type: z.string(),
        message: z.string(),
        http_code: z.number(),
      }),
      request_id: z.string(),
    }),
  ),
);

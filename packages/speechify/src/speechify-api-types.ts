import { z } from 'zod/v4';

export type SpeechifySpeechAudioFormat = 'mp3' | 'wav' | 'ogg' | 'aac' | 'pcm';

export type SpeechifySpeechRequest = {
  input: string;
  voice_id: string;
  model: string;
  language?: string;
  audio_format?: SpeechifySpeechAudioFormat;
  output_format?: string;
  options?: {
    loudness_normalization?: boolean;
    text_normalization?: boolean;
  };
};

export const speechifySpeechResponseSchema = z.object({
  audio_data: z.string(),
  audio_format: z.string().nullish(),
  speech_marks: z.unknown().nullish(),
  billable_characters_count: z.number().nullish(),
});

export type SpeechifySpeechResponse = z.infer<
  typeof speechifySpeechResponseSchema
>;

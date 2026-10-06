import { z } from 'zod/v4';

export type GradiumSpeechModelId = 'default' | (string & {});
export type GradiumTranscriptionModelId =
  | 'default'
  | 'stt-translate'
  | (string & {});

export const gradiumOutputFormats = [
  'wav',
  'pcm',
  'opus',
  'ulaw_8000',
  'alaw_8000',
  'pcm_8000',
  'pcm_16000',
  'pcm_24000',
] as const;

const commonOptions = {
  jsonConfig: z.record(z.string(), z.json()).optional(),
  clientRequestId: z.string().optional(),
};

export const gradiumSpeechOptionsSchema = z.object({
  ...commonOptions,
  voiceId: z.string().optional(),
  voice: z.string().optional(),
  pronunciationId: z.string().optional(),
});

export const gradiumTranscriptionOptionsSchema = z.object({
  ...commonOptions,
  inputFormat: z.enum(['wav', 'opus', 'pcm']).optional(),
});

export type GradiumSpeechModelOptions = z.infer<
  typeof gradiumSpeechOptionsSchema
>;
export type GradiumTranscriptionModelOptions = z.infer<
  typeof gradiumTranscriptionOptionsSchema
>;

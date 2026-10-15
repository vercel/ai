import { z } from 'zod/v4';

const cartesiaSpeechEmotions = [
  'neutral',
  'happy',
  'excited',
  'enthusiastic',
  'elated',
  'euphoric',
  'triumphant',
  'amazed',
  'surprised',
  'flirtatious',
  'curious',
  'content',
  'peaceful',
  'serene',
  'calm',
  'grateful',
  'affectionate',
  'trust',
  'sympathetic',
  'anticipation',
  'mysterious',
  'angry',
  'mad',
  'outraged',
  'frustrated',
  'agitated',
  'threatened',
  'disgusted',
  'contempt',
  'envious',
  'sarcastic',
  'ironic',
  'sad',
  'dejected',
  'melancholic',
  'disappointed',
  'hurt',
  'guilty',
  'bored',
  'tired',
  'rejected',
  'nostalgic',
  'wistful',
  'apologetic',
  'hesitant',
  'insecure',
  'confused',
  'resigned',
  'anxious',
  'panicked',
  'alarmed',
  'scared',
  'proud',
  'confident',
  'distant',
  'skeptical',
  'contemplative',
  'determined',
] as const;

// https://docs.cartesia.ai/api-reference/tts/bytes
export const cartesiaSpeechModelOptionsSchema = z.object({
  /** Container format for the output audio (raw, wav, mp3). */
  container: z.enum(['raw', 'wav', 'mp3']).nullish(),
  /** Encoding type for the audio output (pcm_f32le, pcm_s16le, pcm_mulaw, pcm_alaw). */
  encoding: z
    .enum(['pcm_f32le', 'pcm_s16le', 'pcm_mulaw', 'pcm_alaw'])
    .nullish(),
  /** Sample rate for the output audio in Hz (e.g. 8000, 16000, 22050, 24000, 44100, 48000). */
  sampleRate: z
    .union([
      z.literal(8000),
      z.literal(16000),
      z.literal(22050),
      z.literal(24000),
      z.literal(44100),
      z.literal(48000),
    ])
    .nullish(),
  /** Bitrate for mp3 output in bits per second (e.g. 32000, 64000, 128000, 192000). */
  bitRate: z
    .union([
      z.literal(32000),
      z.literal(64000),
      z.literal(96000),
      z.literal(128000),
      z.literal(192000),
    ])
    .nullish(),
  /** Controls the speed of the generated speech. */
  speed: z.number().min(0.6).max(1.5).nullish(),
  /** Volume of the generated speech, between 0.5 and 2. Sonic 3 and newer. */
  volume: z.number().min(0.5).max(2).nullish(),
  /** Emotion of the generated speech. Beta, works best with English. Sonic 3 and newer. */
  emotion: z.enum(cartesiaSpeechEmotions).nullish(),
  /** The language to generate speech in (ISO 639-1 code). */
  language: z.string().nullish(),
});

export type CartesiaSpeechModelOptions = z.infer<
  typeof cartesiaSpeechModelOptionsSchema
>;

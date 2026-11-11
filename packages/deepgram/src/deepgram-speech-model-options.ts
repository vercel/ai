import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://developers.deepgram.com/reference/text-to-speech/speak-request
// https://developers.deepgram.com/docs/flux-tts/batch
export const deepgramSpeechModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Bitrate of the audio in bits per second. Can be a number or predefined enum value. */
      bitRate: z.union([z.number(), z.string()]).nullish(),
      /** Container format for the output audio (mp3, wav, etc.). */
      container: z.string().nullish(),
      /** Encoding type for the audio output (linear16, mulaw, alaw, etc.). */
      encoding: z.string().nullish(),
      /** Sample rate for the output audio in Hz (8000, 16000, 24000, 44100, 48000). */
      sampleRate: z.number().nullish(),
      /**
       * URL to which Deepgram would deliver the audio asynchronously.
       *
       * Deepgram answers callback requests with a JSON acknowledgement instead
       * of audio, so `generateSpeech` rejects this option.
       *
       * @deprecated Not supported by generateSpeech: throws InvalidArgumentError.
       */
      callback: z.string().url().nullish(),
      /**
       * HTTP method by which the callback request will be made (POST or PUT).
       *
       * @deprecated Ignored (with a warning).
       */
      callbackMethod: z.enum(['POST', 'PUT']).nullish(),
      /**
       * Flux TTS only (beta): delivery register from -2 (calm) to 2
       * (animated). Defaults to 0, the voice's tuned delivery.
       */
      expressivity: z.number().int().min(-2).max(2).nullish(),
      /** Opts out requests from the Deepgram Model Improvement Program. */
      mipOptOut: z.boolean().nullish(),
      /** Label your requests for the purpose of identification during usage reporting. */
      tag: z.union([z.string(), z.array(z.string())]).nullish(),
    }),
  ),
);

export type DeepgramSpeechModelOptions = InferSchema<
  typeof deepgramSpeechModelOptionsSchema
>;

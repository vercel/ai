import {
  lazySchema,
  zodSchema,
  type InferSchema,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

// https://developers.deepgram.com/docs/pre-recorded-audio#results
export const deepgramTranscriptionModelOptionsSchema = lazySchema(() =>
  zodSchema(
    z.object({
      /** Language to use for transcription. If not specified, Deepgram defaults to English. Use `detectLanguage: true` to enable automatic language detection. */
      language: z.string().nullish(),
      /** Whether to enable automatic language detection. When true, Deepgram will detect the language of the audio. */
      detectLanguage: z.boolean().nullish(),
      /** Whether to use smart formatting, which formats written-out numbers, dates, times, etc. */
      smartFormat: z.boolean().nullish(),
      /** Whether to add punctuation to the transcript. */
      punctuate: z.boolean().nullish(),
      /** Whether to format the transcript into paragraphs. */
      paragraphs: z.boolean().nullish(),
      /** Whether to generate a summary of the transcript. Use 'v2' for the latest version or false to disable. */
      summarize: z.union([z.literal('v2'), z.literal(false)]).nullish(),
      /** Whether to identify topics in the transcript. */
      topics: z.boolean().nullish(),
      /** Whether to identify intents in the transcript. */
      intents: z.boolean().nullish(),
      /** Whether to analyze sentiment in the transcript. */
      sentiment: z.boolean().nullish(),
      /** Whether to detect and tag named entities in the transcript. */
      detectEntities: z.boolean().nullish(),
      /** Specify terms or patterns to redact from the transcript. Can be a string or array of strings. */
      redact: z.union([z.string(), z.array(z.string())]).nullish(),
      /** String to replace redacted content with. */
      replace: z.string().nullish(),
      /** Term or phrase to search for in the transcript. */
      search: z.string().nullish(),
      /** Key term to identify in the transcript. */
      keyterm: z.string().nullish(),
      /** Whether to identify different speakers in the audio. */
      diarize: z.boolean().nullish(),
      /** Whether to segment the transcript into utterances. */
      utterances: z.boolean().nullish(),
      /** Minimum duration of silence (in seconds) to trigger a new utterance. */
      uttSplit: z.number().nullish(),
      /** Whether to include filler words (um, uh, etc.) in the transcript. */
      fillerWords: z.boolean().nullish(),
      /**
       * Options for live transcription. Nova models use the /v1/listen
       * WebSocket and Flux models the turn-based /v2/listen WebSocket; each
       * option applies to one of the two and is ignored with a warning on the
       * other.
       */
      streaming: z
        .object({
          /** Return revisable transcripts before a segment is finalized. */
          interimResults: z.boolean().optional(),
          /** Silence duration in milliseconds, or false to disable endpointing. */
          endpointing: z
            .union([z.number().int().nonnegative(), z.literal(false)])
            .optional(),
          /** Number of interleaved input audio channels. Defaults to one. */
          channels: z.number().int().positive().optional(),
          /** Transcribe each input channel independently. */
          multichannel: z.boolean().optional(),
          /** Emit speech-start events in raw chunks. */
          vadEvents: z.boolean().optional(),
          /** Silence duration in milliseconds before an utterance-end event. */
          utteranceEndMs: z.number().int().min(1000).optional(),
          /** Flux: confidence required to end a turn (0.5 to 1, default 0.7). */
          eotThreshold: z.number().min(0.5).max(1).optional(),
          /**
           * Flux: confidence required for an early `EagerEndOfTurn` event
           * (0.3 to 0.9). Enables `EagerEndOfTurn` and `TurnResumed` events.
           */
          eagerEotThreshold: z.number().min(0.3).max(0.9).optional(),
          /** Flux: silence in milliseconds that forces the end of a turn. */
          eotTimeoutMs: z.number().int().min(500).max(60000).optional(),
          /**
           * Flux Multilingual (`flux-general-multi`): language codes that
           * bias detection. Without hints the language is auto-detected.
           */
          languageHints: z.array(z.string().min(1)).optional(),
        })
        .optional(),
    }),
  ),
);

export type DeepgramTranscriptionModelOptions = InferSchema<
  typeof deepgramTranscriptionModelOptionsSchema
>;

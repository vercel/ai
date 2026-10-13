import { z } from 'zod/v4';

export type GoogleVertexGeminiTranscriptionModelId =
  | 'gemini-3.5-transcribe'
  | 'gemini-3.5-transcribe-live'
  | (string & {});

/**
 * Speech recognition options for Gemini transcription models
 * (`gemini-3.5-transcribe`). Maps onto Google's `AudioTranscriptionConfig`.
 * The live variant (`gemini-3.5-transcribe-live`) requires streaming
 * transcription, which is only available in AI SDK v7.
 */
export const googleVertexGeminiTranscriptionModelOptions = z.object({
  /**
   * BCP-47 language codes providing hints about the languages present in the
   * audio. If omitted or empty, defaults to automatic language detection.
   */
  languageCodes: z.array(z.string()).optional(),

  /**
   * Custom vocabulary phrases, which bias the speech recognition model
   * toward recognizing specific terms.
   */
  customVocabulary: z.array(z.string()).optional(),

  /**
   * Enables word-level timestamp generation.
   */
  wordTimestamp: z.boolean().optional(),

  /**
   * Enables speaker diarization.
   */
  diarization: z.boolean().optional(),

  /**
   * Transcription output formatting mode.
   *
   * - `VERBATIM` (default): exact literal transcript preserving filler
   *   words, repetitions, and false starts.
   * - `SMART`: cleans up and structures the transcript in real time —
   *   disfluency removal, inline self-corrections, structured formatting
   *   (lists, numbers, dates, paragraph breaks), and grammar/casing polish.
   */
  mode: z.enum(['SMART', 'VERBATIM']).optional(),
});

export type GoogleVertexTranscriptionModelGeminiOptions = z.infer<
  typeof googleVertexGeminiTranscriptionModelOptions
>;

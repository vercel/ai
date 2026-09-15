/**
 * Transcription model to use.
 *
 * - `solaria-1` (default): generalist model with the broadest language coverage
 *   (100+ languages), supports code switching and multi-language configuration,
 *   and is available for both pre-recorded and live transcription.
 * - `solaria-3`: latest model, tuned for the highest accuracy on European
 *   real-world audio. Pre-recorded (async) only. Supports a single language
 *   chosen from English, French, German, Spanish, or Italian — pass exactly one
 *   language in `languageConfig.languages` with no code switching.
 *
 * If omitted, the Gladia API uses its default model (`solaria-1`).
 */
export type GladiaTranscriptionModelId =
  | 'solaria-1'
  | 'solaria-3'
  | (string & {});

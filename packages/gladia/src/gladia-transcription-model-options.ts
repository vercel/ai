import { z } from 'zod/v4';

// https://docs.gladia.io/api-reference/v2/pre-recorded/init
// Source of truth: https://api.gladia.io/openapi.json → InitTranscriptionRequest
export const gladiaTranscriptionModelOptionsSchema = z.object({
  /**
   * Custom vocabulary to improve transcription accuracy.
   */
  customVocabulary: z.boolean().nullish(),

  /**
   * Configuration for custom vocabulary.
   */
  customVocabularyConfig: z
    .object({
      /**
       * Array of vocabulary terms or objects with pronunciation details.
       */
      vocabulary: z.array(
        z.union([
          z.string(),
          z.object({
            value: z.string(),
            intensity: z.number().nullish(),
            pronunciations: z.array(z.string()).nullish(),
            language: z.string().nullish(),
          }),
        ]),
      ),
      /**
       * Default intensity for all vocabulary terms.
       */
      defaultIntensity: z.number().nullish(),
    })
    .nullish(),

  /**
   * Language configuration for transcription.
   */
  languageConfig: z
    .object({
      /**
       * Languages to use for transcription. If empty, language is auto-detected.
       */
      languages: z.array(z.string()).nullish(),
      /**
       * If true, language is auto-detected on each utterance.
       */
      codeSwitching: z.boolean().nullish(),
    })
    .nullish(),

  /**
   * Whether to enable callback when transcription is complete.
   */
  callback: z.boolean().nullish(),

  /**
   * Configuration for callback.
   */
  callbackConfig: z
    .object({
      url: z.string(),
      method: z.enum(['POST', 'PUT']).nullish(),
    })
    .nullish(),

  /**
   * Whether to generate subtitles.
   */
  subtitles: z.boolean().nullish(),

  /**
   * Configuration for subtitles generation.
   */
  subtitlesConfig: z
    .object({
      formats: z.array(z.enum(['srt', 'vtt'])).nullish(),
      minimumDuration: z.number().nullish(),
      maximumDuration: z.number().nullish(),
      maximumCharactersPerRow: z.number().nullish(),
      maximumRowsPerCaption: z.number().nullish(),
      style: z.enum(['default', 'compliance']).nullish(),
    })
    .nullish(),

  /**
   * Whether to enable speaker diarization (speaker identification).
   */
  diarization: z.boolean().nullish(),

  /**
   * Configuration for diarization.
   */
  diarizationConfig: z
    .object({
      numberOfSpeakers: z.number().nullish(),
      minSpeakers: z.number().nullish(),
      maxSpeakers: z.number().nullish(),
    })
    .nullish(),

  /**
   * Whether to translate the transcription.
   */
  translation: z.boolean().nullish(),

  /**
   * Configuration for translation.
   */
  translationConfig: z
    .object({
      targetLanguages: z.array(z.string()),
      model: z.enum(['base', 'enhanced']).nullish(),
      matchOriginalUtterances: z.boolean().nullish(),
      lipsync: z.boolean().nullish(),
      contextAdaptation: z.boolean().nullish(),
      context: z.string().nullish(),
      informal: z.boolean().nullish(),
    })
    .nullish(),

  /**
   * Whether to generate a summary of the transcription.
   */
  summarization: z.boolean().nullish(),

  /**
   * Configuration for summarization.
   */
  summarizationConfig: z
    .object({
      type: z.enum(['general', 'bullet_points', 'concise']).nullish(),
    })
    .nullish(),

  /**
   * Whether to enable named entity recognition.
   */
  namedEntityRecognition: z.boolean().nullish(),

  /**
   * Whether to enable custom spelling.
   */
  customSpelling: z.boolean().nullish(),

  /**
   * Configuration for custom spelling.
   */
  customSpellingConfig: z
    .object({
      spellingDictionary: z.record(z.string(), z.array(z.string())),
    })
    .nullish(),

  /**
   * Whether to perform sentiment analysis on the transcription.
   */
  sentimentAnalysis: z.boolean().nullish(),

  /**
   * Whether to send audio to a language model for processing.
   */
  audioToLlm: z.boolean().nullish(),

  /**
   * Configuration for audio to language model processing.
   */
  audioToLlmConfig: z
    .object({
      prompts: z.array(z.string()),
      model: z.string().nullish(),
    })
    .nullish(),

  /**
   * Whether to enable PII redaction.
   */
  piiRedaction: z.boolean().nullish(),

  /**
   * Configuration for PII redaction.
   */
  piiRedactionConfig: z
    .object({
      entityTypes: z.array(z.string()).nullish(),
      processedTextType: z.enum(['MARKER', 'MASK']).nullish(),
    })
    .nullish(),

  /**
   * Custom metadata to include with the transcription.
   */
  customMetadata: z.record(z.string(), z.unknown()).nullish(),

  /**
   * Whether to include sentence-level segmentation.
   */
  sentences: z.boolean().nullish(),

  /**
   * Whether to enhance punctuation in the transcription.
   */
  punctuationEnhanced: z.boolean().nullish(),
});

export type GladiaTranscriptionModelOptions = z.infer<
  typeof gladiaTranscriptionModelOptionsSchema
>;

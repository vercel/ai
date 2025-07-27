import {
  AISDKError,
  TranscriptionModelV2,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  delay,
  getFromApi,
  parseProviderOptions,
  postFormDataToApi,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { GladiaConfig } from './gladia-config';
import { gladiaFailedResponseHandler } from './gladia-error';
import { GladiaTranscriptionInitiateAPITypes } from './gladia-api-types';

// https://docs.gladia.io/api-reference/v2/pre-recorded/init
const gladiaProviderOptionsSchema = z.object({
  /**
   * Optional context prompt to guide the transcription.
   */
  contextPrompt: z.string().nullish(),

  /**
   * Custom vocabulary to improve transcription accuracy.
   * Can be a boolean or an array of custom terms.
   */
  customVocabulary: z.union([z.boolean(), z.array(z.any())]).nullish(),

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
            /**
             * The vocabulary term.
             */
            value: z.string(),
            /**
             * Intensity of the term in recognition (optional).
             */
            intensity: z.number().nullish(),
            /**
             * Alternative pronunciations for the term (optional).
             */
            pronunciations: z.array(z.string()).nullish(),
            /**
             * Language of the term (optional).
             */
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
   * Whether to automatically detect the language of the audio.
   */
  detectLanguage: z.boolean().nullish(),

  /**
   * Whether to enable code switching (multiple languages in the same audio).
   */
  enableCodeSwitching: z.boolean().nullish(),

  /**
   * Configuration for code switching.
   */
  codeSwitchingConfig: z
    .object({
      /**
       * Languages to consider for code switching.
       */
      languages: z.array(z.string()).nullish(),
    })
    .nullish(),

  /**
   * Specific language for transcription.
   */
  language: z.string().nullish(),

  /**
   * Whether to enable callback when transcription is complete.
   */
  callback: z.boolean().nullish(),

  /**
   * Configuration for callback.
   */
  callbackConfig: z
    .object({
      /**
       * URL to send the callback to.
       */
      url: z.string(),
      /**
       * HTTP method for the callback.
       */
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
      /**
       * Subtitle file formats to generate.
       */
      formats: z.array(z.enum(['srt', 'vtt'])).nullish(),
      /**
       * Minimum duration for subtitle segments.
       */
      minimumDuration: z.number().nullish(),
      /**
       * Maximum duration for subtitle segments.
       */
      maximumDuration: z.number().nullish(),
      /**
       * Maximum characters per row in subtitles.
       */
      maximumCharactersPerRow: z.number().nullish(),
      /**
       * Maximum rows per caption in subtitles.
       */
      maximumRowsPerCaption: z.number().nullish(),
      /**
       * Style of subtitles.
       */
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
      /**
       * Exact number of speakers to identify.
       */
      numberOfSpeakers: z.number().nullish(),
      /**
       * Minimum number of speakers to identify.
       */
      minSpeakers: z.number().nullish(),
      /**
       * Maximum number of speakers to identify.
       */
      maxSpeakers: z.number().nullish(),
      /**
       * Whether to use enhanced diarization.
       */
      enhanced: z.boolean().nullish(),
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
      /**
       * Target languages for translation.
       */
      targetLanguages: z.array(z.string()),
      /**
       * Translation model to use.
       */
      model: z.enum(['base', 'enhanced']).nullish(),
      /**
       * Whether to match original utterances in translation.
       */
      matchOriginalUtterances: z.boolean().nullish(),
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
      /**
       * Type of summary to generate.
       */
      type: z.enum(['general', 'bullet_points', 'concise']).nullish(),
    })
    .nullish(),

  /**
   * Whether to enable content moderation.
   */
  moderation: z.boolean().nullish(),

  /**
   * Whether to enable named entity recognition.
   */
  namedEntityRecognition: z.boolean().nullish(),

  /**
   * Whether to enable automatic chapter creation.
   */
  chapterization: z.boolean().nullish(),

  /**
   * Whether to ensure consistent naming of entities.
   */
  nameConsistency: z.boolean().nullish(),

  /**
   * Whether to enable custom spelling.
   */
  customSpelling: z.boolean().nullish(),

  /**
   * Configuration for custom spelling.
   */
  customSpellingConfig: z
    .object({
      /**
       * Dictionary of custom spellings.
       */
      spellingDictionary: z.record(z.string(), z.array(z.string())),
    })
    .nullish(),

  /**
   * Whether to extract structured data from the transcription.
   */
  structuredDataExtraction: z.boolean().nullish(),

  /**
   * Configuration for structured data extraction.
   */
  structuredDataExtractionConfig: z
    .object({
      /**
       * Classes of data to extract.
       */
      classes: z.array(z.string()),
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
      /**
       * Prompts to send to the language model.
       */
      prompts: z.array(z.string()),
    })
    .nullish(),

  /**
   * Custom metadata to include with the transcription.
   */
  customMetadata: z.record(z.string(), z.any()).nullish(),

  /**
   * Whether to include sentence-level segmentation.
   */
  sentences: z.boolean().nullish(),

  /**
   * Whether to enable display mode.
   */
  displayMode: z.boolean().nullish(),

  /**
   * Whether to enhance punctuation in the transcription.
   */
  punctuationEnhanced: z.boolean().nullish(),
});

export type GladiaTranscriptionCallOptions = z.infer<
  typeof gladiaProviderOptionsSchema
>;

interface GladiaTranscriptionModelConfig extends GladiaConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GladiaTranscriptionModel implements TranscriptionModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: 'default',
    private readonly config: GladiaTranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV2['doGenerate']>[0]) {
    const warnings: TranscriptionModelV2CallWarning[] = [];

    // Parse provider options
    const gladiaOptions = await parseProviderOptions({
      provider: 'gladia',
      providerOptions,
      schema: gladiaProviderOptionsSchema,
    });

    const body: Omit<GladiaTranscriptionInitiateAPITypes, 'audio_url'> = {};

    // Add provider-specific options
    if (gladiaOptions) {
      body.context_prompt = gladiaOptions.contextPrompt ?? undefined;
      body.custom_vocabulary = gladiaOptions.customVocabulary ?? undefined;
      body.detect_language = gladiaOptions.detectLanguage ?? undefined;
      body.enable_code_switching =
        gladiaOptions.enableCodeSwitching ?? undefined;
      body.language = gladiaOptions.language ?? undefined;
      body.callback = gladiaOptions.callback ?? undefined;
      body.subtitles = gladiaOptions.subtitles ?? undefined;
      body.diarization = gladiaOptions.diarization ?? undefined;
      body.translation = gladiaOptions.translation ?? undefined;
      body.summarization = gladiaOptions.summarization ?? undefined;
      body.moderation = gladiaOptions.moderation ?? undefined;
      body.named_entity_recognition =
        gladiaOptions.namedEntityRecognition ?? undefined;
      body.chapterization = gladiaOptions.chapterization ?? undefined;
      body.name_consistency = gladiaOptions.nameConsistency ?? undefined;
      body.custom_spelling = gladiaOptions.customSpelling ?? undefined;
      body.structured_data_extraction =
        gladiaOptions.structuredDataExtraction ?? undefined;
      body.structured_data_extraction_config =
        gladiaOptions.structuredDataExtractionConfig ?? undefined;
      body.sentiment_analysis = gladiaOptions.sentimentAnalysis ?? undefined;
      body.audio_to_llm = gladiaOptions.audioToLlm ?? undefined;
      body.audio_to_llm_config = gladiaOptions.audioToLlmConfig ?? undefined;
      body.custom_metadata = gladiaOptions.customMetadata ?? undefined;
      body.sentences = gladiaOptions.sentences ?? undefined;
      body.display_mode = gladiaOptions.displayMode ?? undefined;
      body.punctuation_enhanced =
        gladiaOptions.punctuationEnhanced ?? undefined;

      if (gladiaOptions.customVocabularyConfig) {
        body.custom_vocabulary_config = {
          vocabulary: gladiaOptions.customVocabularyConfig.vocabulary.map(
            item => {
              if (typeof item === 'string') return item;
              return {
                value: item.value,
                intensity: item.intensity ?? undefined,
                pronunciations: item.pronunciations ?? undefined,
                language: item.language ?? undefined,
              };
            },
          ),
          default_intensity:
            gladiaOptions.customVocabularyConfig.defaultIntensity ?? undefined,
        };
      }

      // Handle code switching config
      if (gladiaOptions.codeSwitchingConfig) {
        body.code_switching_config = {
          languages: gladiaOptions.codeSwitchingConfig.languages ?? undefined,
        };
      }

      // Handle callback config
      if (gladiaOptions.callbackConfig) {
        body.callback_config = {
          url: gladiaOptions.callbackConfig.url,
          method: gladiaOptions.callbackConfig.method ?? undefined,
        };
      }

      // Handle subtitles config
      if (gladiaOptions.subtitlesConfig) {
        body.subtitles_config = {
          formats: gladiaOptions.subtitlesConfig.formats ?? undefined,
          minimum_duration:
            gladiaOptions.subtitlesConfig.minimumDuration ?? undefined,
          maximum_duration:
            gladiaOptions.subtitlesConfig.maximumDuration ?? undefined,
          maximum_characters_per_row:
            gladiaOptions.subtitlesConfig.maximumCharactersPerRow ?? undefined,
          maximum_rows_per_caption:
            gladiaOptions.subtitlesConfig.maximumRowsPerCaption ?? undefined,
          style: gladiaOptions.subtitlesConfig.style ?? undefined,
        };
      }

      // Handle diarization config
      if (gladiaOptions.diarizationConfig) {
        body.diarization_config = {
          number_of_speakers:
            gladiaOptions.diarizationConfig.numberOfSpeakers ?? undefined,
          min_speakers:
            gladiaOptions.diarizationConfig.minSpeakers ?? undefined,
          max_speakers:
            gladiaOptions.diarizationConfig.maxSpeakers ?? undefined,
          enhanced: gladiaOptions.diarizationConfig.enhanced ?? undefined,
        };
      }

      // Handle translation config
      if (gladiaOptions.translationConfig) {
        body.translation_config = {
          target_languages: gladiaOptions.translationConfig.targetLanguages,
          model: gladiaOptions.translationConfig.model ?? undefined,
          match_original_utterances:
            gladiaOptions.translationConfig.matchOriginalUtterances ??
            undefined,
        };
      }

      // Handle summarization config
      if (gladiaOptions.summarizationConfig) {
        body.summarization_config = {
          type: gladiaOptions.summarizationConfig.type ?? undefined,
        };
      }

      // Handle custom spelling config
      if (gladiaOptions.customSpellingConfig) {
        body.custom_spelling_config = {
          spelling_dictionary:
            gladiaOptions.customSpellingConfig.spellingDictionary,
        };
      }
    }

    return {
      body,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      options.audio instanceof Uint8Array
        ? new Blob([options.audio])
        : new Blob([convertBase64ToUint8Array(options.audio)]);

    formData.append('model', this.modelId);
    formData.append(
      'audio',
      new File([blob], 'audio', { type: options.mediaType }),
    );

    const { value: uploadResponse } = await postFormDataToApi({
      url: this.config.url({
        path: '/v2/upload',
        modelId: 'default',
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: gladiaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        gladiaUploadResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { body, warnings } = await this.getArgs(options);

    const { value: transcriptionInitResponse } = await postJsonToApi({
      url: this.config.url({
        path: '/v2/pre-recorded',
        modelId: 'default',
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        audio_url: uploadResponse.audio_url,
      },
      failedResponseHandler: gladiaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        gladiaTranscriptionInitializeResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Poll the result URL until the transcription is done or an error occurs
    const resultUrl = transcriptionInitResponse.result_url;
    let transcriptionResult;
    let transcriptionResultHeaders;
    const timeoutMs = 60 * 1000; // 60 seconds timeout
    const startTime = Date.now();
    const pollingInterval = 1000;

    while (true) {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new AISDKError({
          message: 'Transcription job polling timed out',
          name: 'TranscriptionJobPollingTimedOut',
          cause: transcriptionResult,
        });
      }

      const response = await getFromApi({
        url: resultUrl,
        headers: combineHeaders(this.config.headers(), options.headers),
        failedResponseHandler: gladiaFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          gladiaTranscriptionResultResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });

      transcriptionResult = response.value;
      transcriptionResultHeaders = response.responseHeaders;

      if (transcriptionResult.status === 'done') {
        break;
      }

      if (transcriptionResult.status === 'error') {
        throw new AISDKError({
          message: 'Transcription job failed',
          name: 'TranscriptionJobFailed',
          cause: transcriptionResult,
        });
      }

      // Wait for the configured polling interval before checking again
      await delay(pollingInterval);
    }

    if (!transcriptionResult.result) {
      throw new AISDKError({
        message: 'Transcription result is empty',
        name: 'TranscriptionResultEmpty',
        cause: transcriptionResult,
      });
    }

    // Process the successful result
    return {
      text: transcriptionResult.result.transcription.full_transcript,
      durationInSeconds: transcriptionResult.result.metadata.audio_duration,
      language: transcriptionResult.result.transcription.languages.at(0),
      segments: transcriptionResult.result.transcription.utterances.map(
        utterance => ({
          text: utterance.text,
          startSecond: utterance.start,
          endSecond: utterance.end,
        }),
      ),
      response: {
        timestamp: currentDate,
        modelId: 'default',
        headers: transcriptionResultHeaders,
      },
      providerMetadata: {
        gladia: transcriptionResult,
      },
      warnings,
    };
  }
}

const gladiaUploadResponseSchema = z.object({
  audio_url: z.string(),
});

const gladiaTranscriptionInitializeResponseSchema = z.object({
  result_url: z.string(),
});

const gladiaTranscriptionResultResponseSchema = z.object({
  status: z.enum(['queued', 'processing', 'done', 'error']),
  result: z
    .object({
      metadata: z.object({
        audio_duration: z.number(),
      }),
      transcription: z.object({
        full_transcript: z.string(),
        languages: z.array(z.string()),
        utterances: z.array(
          z.object({
            start: z.number(),
            end: z.number(),
            text: z.string(),
          }),
        ),
      }),
    })
    .nullish(),
});

import {
  AISDKError,
  type TranscriptionModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  delay,
  getFromApi,
  isSameOrigin,
  parseProviderOptions,
  postFormDataToApi,
  postJsonToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GladiaConfig } from './gladia-config';
import { gladiaFailedResponseHandler } from './gladia-error';
import { gladiaTranscriptionModelOptionsSchema } from './gladia-transcription-model-options';
import type { GladiaTranscriptionInitiateAPITypes } from './gladia-api-types';
import type { GladiaTranscriptionModelId } from './gladia-transcription-options';

interface GladiaTranscriptionModelConfig extends GladiaConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GladiaTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: GladiaTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GladiaTranscriptionModelId;
    config: GladiaTranscriptionModelConfig;
  }) {
    return new GladiaTranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: GladiaTranscriptionModelId,
    private readonly config: GladiaTranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    // Parse provider options
    const gladiaOptions = await parseProviderOptions({
      provider: 'gladia',
      providerOptions,
      schema: gladiaTranscriptionModelOptionsSchema,
    });

    const body: Omit<GladiaTranscriptionInitiateAPITypes, 'audio_url'> = {};

    // Select the transcription model. `default` is the placeholder used when no
    // model id is passed to `gladia.transcription()`; in that case we omit the
    // field and let the Gladia API fall back to its own default (`solaria-1`).
    if (this.modelId !== 'default') {
      body.model = this.modelId;
    }

    // Add provider-specific options
    if (gladiaOptions) {
      body.custom_vocabulary = gladiaOptions.customVocabulary ?? undefined;
      body.callback = gladiaOptions.callback ?? undefined;
      body.subtitles = gladiaOptions.subtitles ?? undefined;
      body.diarization = gladiaOptions.diarization ?? undefined;
      body.translation = gladiaOptions.translation ?? undefined;
      body.summarization = gladiaOptions.summarization ?? undefined;
      body.named_entity_recognition =
        gladiaOptions.namedEntityRecognition ?? undefined;
      body.custom_spelling = gladiaOptions.customSpelling ?? undefined;
      body.sentiment_analysis = gladiaOptions.sentimentAnalysis ?? undefined;
      body.audio_to_llm = gladiaOptions.audioToLlm ?? undefined;
      body.pii_redaction = gladiaOptions.piiRedaction ?? undefined;
      body.custom_metadata = gladiaOptions.customMetadata ?? undefined;
      body.sentences = gladiaOptions.sentences ?? undefined;
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

      if (gladiaOptions.languageConfig) {
        // `solaria-3` only supports a single language and no code switching.
        // Warn rather than fail so the request still reaches the API.
        if (this.modelId === 'solaria-3') {
          if ((gladiaOptions.languageConfig.languages?.length ?? 0) > 1) {
            warnings.push({
              type: 'other',
              message:
                'The "solaria-3" model supports a single language only. ' +
                'Pass exactly one language in languageConfig.languages.',
            });
          }
          if (gladiaOptions.languageConfig.codeSwitching) {
            warnings.push({
              type: 'other',
              message:
                'The "solaria-3" model does not support code switching. ' +
                'The codeSwitching option will be ignored.',
            });
          }
        }

        body.language_config = {
          languages: gladiaOptions.languageConfig.languages ?? undefined,
          code_switching:
            gladiaOptions.languageConfig.codeSwitching ?? undefined,
        };
      }

      if (gladiaOptions.callbackConfig) {
        body.callback_config = {
          url: gladiaOptions.callbackConfig.url,
          method: gladiaOptions.callbackConfig.method ?? undefined,
        };
      }

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

      if (gladiaOptions.diarizationConfig) {
        body.diarization_config = {
          number_of_speakers:
            gladiaOptions.diarizationConfig.numberOfSpeakers ?? undefined,
          min_speakers:
            gladiaOptions.diarizationConfig.minSpeakers ?? undefined,
          max_speakers:
            gladiaOptions.diarizationConfig.maxSpeakers ?? undefined,
        };
      }

      if (gladiaOptions.translationConfig) {
        body.translation_config = {
          target_languages: gladiaOptions.translationConfig.targetLanguages,
          model: gladiaOptions.translationConfig.model ?? undefined,
          match_original_utterances:
            gladiaOptions.translationConfig.matchOriginalUtterances ??
            undefined,
          lipsync: gladiaOptions.translationConfig.lipsync ?? undefined,
          context_adaptation:
            gladiaOptions.translationConfig.contextAdaptation ?? undefined,
          context: gladiaOptions.translationConfig.context ?? undefined,
          informal: gladiaOptions.translationConfig.informal ?? undefined,
        };
      }

      if (gladiaOptions.summarizationConfig) {
        body.summarization_config = {
          type: gladiaOptions.summarizationConfig.type ?? undefined,
        };
      }

      if (gladiaOptions.customSpellingConfig) {
        body.custom_spelling_config = {
          spelling_dictionary:
            gladiaOptions.customSpellingConfig.spellingDictionary,
        };
      }

      if (gladiaOptions.audioToLlmConfig) {
        body.audio_to_llm_config = {
          prompts: gladiaOptions.audioToLlmConfig.prompts,
          model: gladiaOptions.audioToLlmConfig.model ?? undefined,
        };
      }

      if (gladiaOptions.piiRedactionConfig) {
        body.pii_redaction_config = {
          entity_types:
            gladiaOptions.piiRedactionConfig.entityTypes ?? undefined,
          processed_text_type:
            gladiaOptions.piiRedactionConfig.processedTextType ?? undefined,
        };
      }
    }

    return {
      body,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      options.audio instanceof Uint8Array
        ? new Blob([options.audio])
        : new Blob([convertBase64ToUint8Array(options.audio)]);

    const fileExtension = mediaTypeToExtension(options.mediaType);
    formData.append(
      'audio',
      new File([blob], 'audio', { type: options.mediaType }),
      `audio.${fileExtension}`,
    );

    const { value: uploadResponse } = await postFormDataToApi({
      url: this.config.url({
        path: '/v2/upload',
        modelId: 'default',
      }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
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
      headers: combineHeaders(this.config.headers?.(), options.headers),
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

    // Poll the result URL until the transcription is done or an error occurs.
    // The result URL comes from the provider response; only send credentials
    // when it stays on the provider's own origin.
    const resultUrl = transcriptionInitResponse.result_url;
    const apiOrigin = this.config.url({ modelId: 'default', path: '' });
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
        headers: isSameOrigin(resultUrl, apiOrigin)
          ? combineHeaders(this.config.headers?.(), options.headers)
          : undefined,
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

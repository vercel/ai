import { TranscriptionModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  extractResponseHeaders,
  parseProviderOptions,
  postJsonToApi,
  postToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { AssemblyAIConfig } from './assemblyai-config';
import { assemblyaiFailedResponseHandler } from './assemblyai-error';
import { AssemblyAITranscriptionModelId } from './assemblyai-transcription-settings';
import { AssemblyAITranscriptionAPITypes } from './assemblyai-api-types';

// https://www.assemblyai.com/docs/api-reference/transcripts/submit
const assemblyaiTranscriptionModelOptionsSchema = z.object({
  /**
   * End time of the audio in milliseconds.
   */
  audioEndAt: z.number().int().nullish(),
  /**
   * Start time of the audio in milliseconds.
   */
  audioStartFrom: z.number().int().nullish(),
  /**
   * Whether to automatically generate chapters for the transcription.
   */
  autoChapters: z.boolean().nullish(),
  /**
   * Whether to automatically generate highlights for the transcription.
   */
  autoHighlights: z.boolean().nullish(),
  /**
   * Boost parameter for the transcription.
   * Allowed values: 'low', 'default', 'high'.
   */
  boostParam: z.string().nullish(),
  /**
   * Whether to enable content safety filtering.
   */
  contentSafety: z.boolean().nullish(),
  /**
   * Confidence threshold for content safety filtering (25-100).
   */
  contentSafetyConfidence: z.number().int().min(25).max(100).nullish(),
  /**
   * Custom spelling rules for the transcription.
   */
  customSpelling: z
    .array(
      z.object({
        from: z.array(z.string()),
        to: z.string(),
      }),
    )
    .nullish(),
  /**
   * Whether to include filler words (um, uh, etc.) in the transcription.
   */
  disfluencies: z.boolean().nullish(),
  /**
   * Whether to enable entity detection.
   */
  entityDetection: z.boolean().nullish(),
  /**
   * Whether to filter profanity from the transcription.
   */
  filterProfanity: z.boolean().nullish(),
  /**
   * Whether to format text with punctuation and capitalization.
   */
  formatText: z.boolean().nullish(),
  /**
   * Whether to enable IAB categories detection.
   */
  iabCategories: z.boolean().nullish(),
  /**
   * Language code for the transcription.
   */
  languageCode: z.union([z.literal('en'), z.string()]).nullish(),
  /**
   * Confidence threshold for language detection.
   */
  languageConfidenceThreshold: z.number().nullish(),
  /**
   * Whether to enable language detection.
   */
  languageDetection: z.boolean().nullish(),
  /**
   * Whether to process audio as multichannel.
   */
  multichannel: z.boolean().nullish(),
  /**
   * Whether to add punctuation to the transcription.
   */
  punctuate: z.boolean().nullish(),
  /**
   * Whether to redact personally identifiable information (PII).
   */
  redactPii: z.boolean().nullish(),
  /**
   * Whether to redact PII in the audio file.
   */
  redactPiiAudio: z.boolean().nullish(),
  /**
   * Audio format for PII redaction.
   */
  redactPiiAudioQuality: z.string().nullish(),
  /**
   * List of PII types to redact.
   */
  redactPiiPolicies: z.array(z.string()).nullish(),
  /**
   * Substitution method for redacted PII.
   */
  redactPiiSub: z.string().nullish(),
  /**
   * Whether to enable sentiment analysis.
   */
  sentimentAnalysis: z.boolean().nullish(),
  /**
   * Whether to identify different speakers in the audio.
   */
  speakerLabels: z.boolean().nullish(),
  /**
   * Number of speakers expected in the audio.
   */
  speakersExpected: z.number().int().nullish(),
  /**
   * Threshold for speech detection (0-1).
   */
  speechThreshold: z.number().min(0).max(1).nullish(),
  /**
   * Whether to generate a summary of the transcription.
   */
  summarization: z.boolean().nullish(),
  /**
   * Model to use for summarization.
   */
  summaryModel: z.string().nullish(),
  /**
   * Type of summary to generate.
   */
  summaryType: z.string().nullish(),
  /**
   * Name of the authentication header for webhook requests.
   */
  webhookAuthHeaderName: z.string().nullish(),
  /**
   * Value of the authentication header for webhook requests.
   */
  webhookAuthHeaderValue: z.string().nullish(),
  /**
   * URL to send webhook notifications to.
   */
  webhookUrl: z.string().nullish(),
  /**
   * List of words to boost recognition for.
   */
  wordBoost: z.array(z.string()).nullish(),
  /**
   * Change how deterministic the response is (0 = most deterministic, 1 = least).
   */
  temperature: z.number().nullish(),
  /**
   * Enable custom topics, either true or false.
   */
  customTopics: z.boolean().nullish(),
  /**
   * The list of custom topics.
   */
  topics: z.array(z.string()).nullish(),
  /**
   * The prompt used to generate the transcript. Can't be used together with keytermsPrompt.
   */
  prompt: z.string().nullish(),
  /**
   * The list of key terms used to generate the transcript. Can't be used together with prompt.
   */
  keytermsPrompt: z.array(z.string()).nullish(),
  /**
   * Advanced options for controlling speaker diarization parameters.
   */
  speakerOptions: z
    .object({
      minSpeakersExpected: z.number().int().nullish(),
      maxSpeakersExpected: z.number().int().nullish(),
    })
    .nullish(),
  /**
   * Options for controlling the behavior of Automatic Language Detection.
   */
  languageDetectionOptions: z
    .object({
      expectedLanguages: z.array(z.string()).nullish(),
      fallbackLanguage: z.string().nullish(),
      codeSwitching: z.boolean().nullish(),
      codeSwitchingConfidenceThreshold: z.number().nullish(),
      onLowLanguageConfidence: z.string().nullish(),
      swissGerman: z.boolean().nullish(),
    })
    .nullish(),
  /**
   * Speech understanding configuration for LLM Gateway features.
   */
  speechUnderstanding: z
    .object({
      request: z
        .object({
          speakerIdentification: z
            .object({
              speakerType: z.enum(['role', 'name']),
              knownValues: z.array(z.string()).nullish(),
            })
            .nullish(),
          translation: z
            .object({
              targetLanguages: z.array(z.string()),
              formal: z.boolean().nullish(),
              matchOriginalUtterance: z.boolean().nullish(),
            })
            .nullish(),
          customFormatting: z
            .object({
              date: z.string().nullish(),
              phoneNumber: z.string().nullish(),
              email: z.string().nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
});

export type AssemblyAITranscriptionModelOptions = z.infer<
  typeof assemblyaiTranscriptionModelOptionsSchema
>;

interface AssemblyAITranscriptionModelConfig extends AssemblyAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
  /**
   * The polling interval for checking transcript status in milliseconds.
   */
  pollingInterval?: number;
}

export class AssemblyAITranscriptionModel implements TranscriptionModelV3 {
  readonly specificationVersion = 'v3';
  private readonly POLLING_INTERVAL_MS = 3000;

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: AssemblyAITranscriptionModelId,
    private readonly config: AssemblyAITranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    // Parse provider options
    const assemblyaiOptions = await parseProviderOptions({
      provider: 'assemblyai',
      providerOptions,
      schema: assemblyaiTranscriptionModelOptionsSchema,
    });

    const body: Omit<AssemblyAITranscriptionAPITypes, 'audio_url'> = {
      speech_models: [this.modelId],
    };

    // Add provider-specific options
    if (assemblyaiOptions) {
      body.audio_end_at = assemblyaiOptions.audioEndAt ?? undefined;
      body.audio_start_from = assemblyaiOptions.audioStartFrom ?? undefined;
      body.auto_chapters = assemblyaiOptions.autoChapters ?? undefined;
      body.auto_highlights = assemblyaiOptions.autoHighlights ?? undefined;
      body.boost_param = (assemblyaiOptions.boostParam as never) ?? undefined;
      body.content_safety = assemblyaiOptions.contentSafety ?? undefined;
      body.content_safety_confidence =
        assemblyaiOptions.contentSafetyConfidence ?? undefined;
      body.custom_spelling =
        (assemblyaiOptions.customSpelling as never) ?? undefined;
      body.disfluencies = assemblyaiOptions.disfluencies ?? undefined;
      body.entity_detection = assemblyaiOptions.entityDetection ?? undefined;
      body.filter_profanity = assemblyaiOptions.filterProfanity ?? undefined;
      body.format_text = assemblyaiOptions.formatText ?? undefined;
      body.iab_categories = assemblyaiOptions.iabCategories ?? undefined;
      body.language_code =
        (assemblyaiOptions.languageCode as never) ?? undefined;
      body.language_confidence_threshold =
        assemblyaiOptions.languageConfidenceThreshold ?? undefined;
      body.language_detection =
        assemblyaiOptions.languageDetection ?? undefined;
      body.multichannel = assemblyaiOptions.multichannel ?? undefined;
      body.punctuate = assemblyaiOptions.punctuate ?? undefined;
      body.redact_pii = assemblyaiOptions.redactPii ?? undefined;
      body.redact_pii_audio = assemblyaiOptions.redactPiiAudio ?? undefined;
      body.redact_pii_audio_quality =
        (assemblyaiOptions.redactPiiAudioQuality as never) ?? undefined;
      body.redact_pii_policies =
        (assemblyaiOptions.redactPiiPolicies as never) ?? undefined;
      body.redact_pii_sub =
        (assemblyaiOptions.redactPiiSub as never) ?? undefined;
      body.sentiment_analysis =
        assemblyaiOptions.sentimentAnalysis ?? undefined;
      body.speaker_labels = assemblyaiOptions.speakerLabels ?? undefined;
      body.speakers_expected = assemblyaiOptions.speakersExpected ?? undefined;
      body.speech_threshold = assemblyaiOptions.speechThreshold ?? undefined;
      body.summarization = assemblyaiOptions.summarization ?? undefined;
      body.summary_model =
        (assemblyaiOptions.summaryModel as never) ?? undefined;
      body.summary_type = (assemblyaiOptions.summaryType as never) ?? undefined;
      body.webhook_auth_header_name =
        assemblyaiOptions.webhookAuthHeaderName ?? undefined;
      body.webhook_auth_header_value =
        assemblyaiOptions.webhookAuthHeaderValue ?? undefined;
      body.webhook_url = assemblyaiOptions.webhookUrl ?? undefined;
      body.word_boost = assemblyaiOptions.wordBoost ?? undefined;
      body.temperature = assemblyaiOptions.temperature ?? undefined;
      body.custom_topics = assemblyaiOptions.customTopics ?? undefined;
      body.topics = assemblyaiOptions.topics ?? undefined;
      body.prompt = assemblyaiOptions.prompt ?? undefined;
      body.keyterms_prompt = assemblyaiOptions.keytermsPrompt ?? undefined;
      body.speaker_options = assemblyaiOptions.speakerOptions
        ? {
            min_speakers_expected:
              assemblyaiOptions.speakerOptions.minSpeakersExpected ?? undefined,
            max_speakers_expected:
              assemblyaiOptions.speakerOptions.maxSpeakersExpected ?? undefined,
          }
        : undefined;
      body.language_detection_options =
        assemblyaiOptions.languageDetectionOptions
          ? {
              expected_languages:
                assemblyaiOptions.languageDetectionOptions.expectedLanguages ??
                undefined,
              fallback_language:
                assemblyaiOptions.languageDetectionOptions.fallbackLanguage ??
                undefined,
              code_switching:
                assemblyaiOptions.languageDetectionOptions.codeSwitching ??
                undefined,
              code_switching_confidence_threshold:
                assemblyaiOptions.languageDetectionOptions
                  .codeSwitchingConfidenceThreshold ?? undefined,
              on_low_language_confidence:
                assemblyaiOptions.languageDetectionOptions
                  .onLowLanguageConfidence ?? undefined,
              swiss_german:
                assemblyaiOptions.languageDetectionOptions.swissGerman ??
                undefined,
            }
          : undefined;
      body.speech_understanding = assemblyaiOptions.speechUnderstanding
        ? {
            request: assemblyaiOptions.speechUnderstanding.request
              ? {
                  speaker_identification:
                    assemblyaiOptions.speechUnderstanding.request
                      .speakerIdentification
                      ? {
                          speaker_type:
                            assemblyaiOptions.speechUnderstanding.request
                              .speakerIdentification.speakerType,
                          known_values:
                            assemblyaiOptions.speechUnderstanding.request
                              .speakerIdentification.knownValues ?? undefined,
                        }
                      : undefined,
                  translation:
                    assemblyaiOptions.speechUnderstanding.request.translation
                      ? {
                          target_languages:
                            assemblyaiOptions.speechUnderstanding.request
                              .translation.targetLanguages,
                          formal:
                            assemblyaiOptions.speechUnderstanding.request
                              .translation.formal ?? undefined,
                          match_original_utterance:
                            assemblyaiOptions.speechUnderstanding.request
                              .translation.matchOriginalUtterance ?? undefined,
                        }
                      : undefined,
                  custom_formatting:
                    assemblyaiOptions.speechUnderstanding.request
                      .customFormatting
                      ? {
                          date: assemblyaiOptions.speechUnderstanding.request
                            .customFormatting.date ?? undefined,
                          phone_number:
                            assemblyaiOptions.speechUnderstanding.request
                              .customFormatting.phoneNumber ?? undefined,
                          email:
                            assemblyaiOptions.speechUnderstanding.request
                              .customFormatting.email ?? undefined,
                        }
                      : undefined,
                }
              : undefined,
          }
        : undefined;
    }

    return {
      body,
      warnings,
    };
  }

  /**
   * Polls the given transcript until we have a status other than `processing` or `queued`.
   *
   * @see https://www.assemblyai.com/docs/getting-started/transcribe-an-audio-file#step-33
   */
  private async waitForCompletion(
    transcriptId: string,
    headers: Record<string, string | undefined> | undefined,
    abortSignal?: AbortSignal,
  ): Promise<{
    transcript: z.infer<typeof assemblyaiTranscriptionResponseSchema>;
    responseHeaders: Record<string, string>;
  }> {
    const pollingInterval =
      this.config.pollingInterval ?? this.POLLING_INTERVAL_MS;

    while (true) {
      if (abortSignal?.aborted) {
        throw new Error('Transcription request was aborted');
      }

      const response = await fetch(
        this.config.url({
          path: `/v2/transcript/${transcriptId}`,
          modelId: this.modelId,
        }),
        {
          method: 'GET',
          headers: combineHeaders(
            this.config.headers(),
            headers,
          ) as HeadersInit,
          signal: abortSignal,
        },
      );

      if (!response.ok) {
        throw await assemblyaiFailedResponseHandler({
          response,
          url: this.config.url({
            path: `/v2/transcript/${transcriptId}`,
            modelId: this.modelId,
          }),
          requestBodyValues: {},
        });
      }

      const transcript = assemblyaiTranscriptionResponseSchema.parse(
        await response.json(),
      );

      if (transcript.status === 'completed') {
        return {
          transcript,
          responseHeaders: extractResponseHeaders(response),
        };
      }

      if (transcript.status === 'error') {
        throw new Error(
          `Transcription failed: ${transcript.error ?? 'Unknown error'}`,
        );
      }

      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const { value: uploadResponse } = await postToApi({
      url: this.config.url({
        path: '/v2/upload',
        modelId: '',
      }),
      headers: {
        'Content-Type': 'application/octet-stream',
        ...combineHeaders(this.config.headers(), options.headers),
      },
      body: {
        content: options.audio,
        values: options.audio,
      },
      failedResponseHandler: assemblyaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        assemblyaiUploadResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { body, warnings } = await this.getArgs(options);

    const { value: submitResponse } = await postJsonToApi({
      url: this.config.url({
        path: '/v2/transcript',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        audio_url: uploadResponse.upload_url,
      },
      failedResponseHandler: assemblyaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        assemblyaiSubmitResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { transcript, responseHeaders } = await this.waitForCompletion(
      submitResponse.id,
      options.headers,
      options.abortSignal,
    );

    return {
      text: transcript.text ?? '',
      segments:
        transcript.words?.map(word => ({
          text: word.text,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language: transcript.language_code ?? undefined,
      durationInSeconds:
        transcript.audio_duration ?? transcript.words?.at(-1)?.end ?? undefined,
      warnings,
      providerMetadata: { assemblyai: transcript },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders, // Headers from final GET request
        body: transcript, // Raw response from final GET request
      },
    };
  }
}

const assemblyaiUploadResponseSchema = z.object({
  upload_url: z.string(),
});

const assemblyaiSubmitResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'error']),
});

const assemblyaiTimestampSchema = z.object({
  start: z.number(),
  end: z.number(),
});

const assemblyaiWordSchema = z.object({
  confidence: z.number(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  channel: z.string().nullish(),
  speaker: z.string().nullish(),
});

const assemblyaiTranscriptionResponseSchema = z.object({
  // Core
  id: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'error']),
  audio_url: z.string().nullish(),
  text: z.string().nullish(),
  error: z.string().nullish(),

  // Audio info
  audio_duration: z.number().nullish(),
  audio_channels: z.number().int().nullish(),
  audio_start_from: z.number().int().nullish(),
  audio_end_at: z.number().int().nullish(),

  // Confidence & Language
  confidence: z.number().nullish(),
  language_code: z.string().nullish(),
  language_codes: z.array(z.string()).nullish(),
  language_confidence: z.number().nullish(),
  language_confidence_threshold: z.number().nullish(),
  language_detection: z.boolean().nullish(),

  // Speech model
  speech_model: z.string().nullish(),
  speech_models: z.array(z.string()).nullish(),
  speech_model_used: z.string().nullish(),
  speech_threshold: z.number().nullish(),

  // Options flags
  punctuate: z.boolean().nullish(),
  format_text: z.boolean().nullish(),
  disfluencies: z.boolean().nullish(),
  filter_profanity: z.boolean().nullish(),
  multichannel: z.boolean().nullish(),

  // Speaker diarization
  speaker_labels: z.boolean().nullish(),
  speakers_expected: z.number().int().nullish(),

  // Words & Utterances
  words: z.array(assemblyaiWordSchema).nullish(),
  utterances: z
    .array(
      z.object({
        confidence: z.number(),
        start: z.number(),
        end: z.number(),
        text: z.string(),
        words: z.array(assemblyaiWordSchema).nullish(),
        channel: z.string().nullish(),
        speaker: z.string().nullish(),
      }),
    )
    .nullish(),

  // Auto chapters
  auto_chapters: z.boolean().nullish(),
  chapters: z
    .array(
      z.object({
        gist: z.string(),
        headline: z.string(),
        summary: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),

  // Auto highlights (Key Phrases)
  auto_highlights: z.boolean().nullish(),
  auto_highlights_result: z
    .object({
      status: z.string().nullish(),
      results: z
        .array(
          z.object({
            count: z.number(),
            rank: z.number(),
            text: z.string(),
            timestamps: z.array(assemblyaiTimestampSchema),
          }),
        )
        .nullish(),
    })
    .nullish(),

  // Content safety
  content_safety: z.boolean().nullish(),
  content_safety_labels: z
    .object({
      status: z.string().nullish(),
      results: z
        .array(
          z.object({
            text: z.string(),
            labels: z.array(
              z.object({
                label: z.string(),
                confidence: z.number(),
                severity: z.number().nullish(),
              }),
            ),
            sentences_idx_start: z.number().nullish(),
            sentences_idx_end: z.number().nullish(),
            timestamp: assemblyaiTimestampSchema,
          }),
        )
        .nullish(),
      summary: z.record(z.string(), z.number()).nullish(),
      severity_score_summary: z
        .record(
          z.string(),
          z.object({
            low: z.number(),
            medium: z.number(),
            high: z.number(),
          }),
        )
        .nullish(),
    })
    .nullish(),

  // Topic detection (IAB categories)
  iab_categories: z.boolean().nullish(),
  iab_categories_result: z
    .object({
      status: z.string().nullish(),
      results: z
        .array(
          z.object({
            text: z.string(),
            labels: z.array(
              z.object({
                relevance: z.number(),
                label: z.string(),
              }),
            ),
            timestamp: assemblyaiTimestampSchema,
          }),
        )
        .nullish(),
      summary: z.record(z.string(), z.number()).nullish(),
    })
    .nullish(),

  // Sentiment analysis
  sentiment_analysis: z.boolean().nullish(),
  sentiment_analysis_results: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
        sentiment: z.string(),
        confidence: z.number(),
        channel: z.string().nullish(),
        speaker: z.string().nullish(),
      }),
    )
    .nullish(),

  // Entity detection
  entity_detection: z.boolean().nullish(),
  entities: z
    .array(
      z.object({
        entity_type: z.string(),
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),

  // Summarization
  summarization: z.boolean().nullish(),
  summary: z.string().nullish(),
  summary_model: z.string().nullish(),
  summary_type: z.string().nullish(),

  // PII redaction
  redact_pii: z.boolean().nullish(),
  redact_pii_audio: z.boolean().nullish(),
  redact_pii_audio_quality: z.string().nullish(),
  redact_pii_policies: z.array(z.string()).nullish(),
  redact_pii_sub: z.string().nullish(),

  // Custom spelling & word boost
  custom_spelling: z
    .array(z.object({ from: z.array(z.string()), to: z.string() }))
    .nullish(),
  word_boost: z.array(z.string()).nullish(),
  boost_param: z.string().nullish(),

  // Webhooks
  webhook_url: z.string().nullish(),
  webhook_auth: z.boolean().nullish(),
  webhook_auth_header_name: z.string().nullish(),
  webhook_status_code: z.number().int().nullish(),

  // Throttling
  throttled: z.boolean().nullish(),

  // Custom topics
  custom_topics: z.boolean().nullish(),
  topics: z.array(z.string()).nullish(),

  // Prompting
  temperature: z.number().nullish(),

  // Language detection results (code-switching)
  language_detection_results: z
    .object({
      code_switching_languages: z
        .array(
          z.object({
            language_code: z.string(),
            confidence: z.number(),
          }),
        )
        .nullish(),
    })
    .nullish(),

  // Speaker options
  speaker_options: z
    .object({
      min_speakers_expected: z.number().int().nullish(),
      max_speakers_expected: z.number().int().nullish(),
    })
    .nullish(),

  // Speech understanding & translations
  speech_understanding: z
    .object({
      request: z
        .object({
          speaker_identification: z
            .object({
              speaker_type: z.enum(['role', 'name']),
              known_values: z.array(z.string()).nullish(),
            })
            .nullish(),
          translation: z
            .object({
              target_languages: z.array(z.string()),
              formal: z.boolean().nullish(),
              match_original_utterance: z.boolean().nullish(),
            })
            .nullish(),
          custom_formatting: z
            .object({
              date: z.string().nullish(),
              phone_number: z.string().nullish(),
              email: z.string().nullish(),
            })
            .nullish(),
        })
        .nullish(),
      response: z
        .object({
          speaker_identification: z
            .object({
              status: z.string(),
              mapping: z.record(z.string(), z.string()).nullish(),
            })
            .nullish(),
          translation: z
            .object({
              status: z.string(),
            })
            .nullish(),
          custom_formatting: z
            .object({
              status: z.string(),
              mapping: z.record(z.string(), z.string()).nullish(),
              formatted_text: z.string().nullish(),
              formatted_utterances: z
                .array(z.record(z.string(), z.unknown()))
                .nullish(),
            })
            .nullish(),
        })
        .nullish(),
    })
    .nullish(),
  translated_texts: z.record(z.string(), z.string()).nullish(),

  // Deprecated/legacy fields
  acoustic_model: z.string().nullish(),
  language_model: z.string().nullish(),
  dual_channel: z.boolean().nullish(),
  speed_boost: z.boolean().nullish(),
});

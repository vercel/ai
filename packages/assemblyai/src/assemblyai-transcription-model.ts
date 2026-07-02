import type {
  TranscriptionModelV3,
  SharedV3Warning,
  SharedV3ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  extractResponseHeaders,
  parseProviderOptions,
  postJsonToApi,
  postToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AssemblyAIConfig } from './assemblyai-config';
import { assemblyaiFailedResponseHandler } from './assemblyai-error';
import type { AssemblyAITranscriptionModelId } from './assemblyai-transcription-settings';
import type { AssemblyAITranscriptionAPITypes } from './assemblyai-api-types';

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
   * Boost parameter for word boost (used with `wordBoost`).
   * Allowed values: 'low', 'default', 'high'.
   *
   * @deprecated Only applies to the deprecated `wordBoost` option. Use
   * `keytermsPrompt` instead, which works with the recommended `universal-*`
   * models.
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
   * Enable a domain-specific model to improve accuracy for specialized
   * terminology. Currently supports `'medical-v1'` (Medical Mode).
   */
  domain: z.string().nullish(),
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
   * Domain-specific keyterms to boost recognition for (max 6 words per phrase).
   * Replaces `wordBoost` for newer models: supported by `universal-3-pro` /
   * `universal-3-5-pro` and `slam-1` (and `universal-2` when metaphone is
   * enabled for the account).
   */
  keytermsPrompt: z.array(z.string()).nullish(),
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
   * Options for automatic language detection.
   */
  languageDetectionOptions: z
    .object({
      /** List of languages expected in the audio file. */
      expectedLanguages: z.array(z.string()).nullish(),
      /** Fallback language if the detected language is not expected. */
      fallbackLanguage: z.string().nullish(),
      /** Whether code switching should be detected. */
      codeSwitching: z.boolean().nullish(),
      /** Confidence threshold for code switching detection (0-1). */
      codeSwitchingConfidenceThreshold: z.number().min(0).max(1).nullish(),
    })
    .nullish(),
  /**
   * Whether to process audio as multichannel.
   */
  multichannel: z.boolean().nullish(),
  /**
   * Provide natural-language context (up to 1,500 words) to steer the model.
   * Only supported by `universal-3-pro` / `universal-3-5-pro` and `slam-1`.
   */
  prompt: z.string().nullish(),
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
   * Options for PII-redacted audio files. Requires `redactPiiAudio`.
   */
  redactPiiAudioOptions: z
    .object({
      /** Return redacted audio even for files without detected speech. */
      returnRedactedNoSpeechAudio: z.boolean().nullish(),
      /** Redaction method; set to `'silence'` to replace PII with silence. */
      overrideAudioRedactionMethod: z.enum(['silence']).nullish(),
    })
    .nullish(),
  /**
   * Audio format for PII redaction.
   */
  redactPiiAudioQuality: z.string().nullish(),
  /**
   * List of PII types to redact.
   */
  redactPiiPolicies: z.array(z.string()).nullish(),
  /**
   * Return the original unredacted transcript alongside the redacted one.
   * Requires `redactPii`.
   */
  redactPiiReturnUnredacted: z.boolean().nullish(),
  /**
   * Substitution method for redacted PII.
   */
  redactPiiSub: z.string().nullish(),
  /**
   * Map of user-defined labels to exact terms to redact, e.g.
   * `{ INTERNAL_TOOL: ['Bearclaw'] }`. Applied on top of standard PII redaction
   * using `redactPiiSub`. Requires `redactPii`.
   */
  redactStaticEntities: z.record(z.string(), z.array(z.string())).nullish(),
  /**
   * Remove inline annotations from rich transcripts. `'all'` removes all inline
   * annotations; `'speaker'` removes only speaker cues. Universal-3 Pro models.
   */
  removeAudioTags: z.enum(['all', 'speaker']).nullish(),
  /**
   * Whether to enable sentiment analysis.
   */
  sentimentAnalysis: z.boolean().nullish(),
  /**
   * Whether to identify different speakers in the audio.
   */
  speakerLabels: z.boolean().nullish(),
  /**
   * Options for speaker diarization, e.g. a range of possible speakers.
   */
  speakerOptions: z
    .object({
      /** Minimum number of speakers expected in the audio file. */
      minSpeakersExpected: z.number().int().nullish(),
      /** Maximum number of speakers expected in the audio file. */
      maxSpeakersExpected: z.number().int().nullish(),
    })
    .nullish(),
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
   * Sampling temperature (0-1) controlling randomness. Universal-3 Pro models.
   */
  temperature: z.number().min(0).max(1).nullish(),
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
   *
   * @deprecated `wordBoost` is rejected by `universal-3-pro` /
   * `universal-3-5-pro` and `slam-1` (it only works on `universal-2`/`best`).
   * Use `keytermsPrompt` instead.
   */
  wordBoost: z.array(z.string()).nullish(),
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

    const body: Omit<AssemblyAITranscriptionAPITypes, 'audio_url'> = {};

    // The legacy `best` model is selected via the deprecated singular
    // `speech_model` parameter. All other models (e.g. `universal-2`,
    // `universal-3-pro`, `universal-3-5-pro`) are only accessible via the
    // `speech_models` array and are rejected by `speech_model`.
    // See https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model
    if (this.modelId === 'best') {
      body.speech_model = this.modelId as 'best';
      warnings.push({
        type: 'other',
        message:
          "The 'best' model is a legacy AssemblyAI model. Use 'universal-3-5-pro' instead. See documentation: https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model",
      });
    } else {
      body.speech_models = [this.modelId];

      // Forward-looking nudge: universal-3-5-pro is AssemblyAI's latest
      // flagship and is set to replace universal-3-pro. Not a deprecation —
      // both models still work — so this is an informational warning only.
      if (
        this.modelId === 'universal-3-pro' ||
        this.modelId === 'universal-2'
      ) {
        const docsUrl =
          'https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model';
        warnings.push({
          type: 'other',
          message:
            this.modelId === 'universal-3-pro'
              ? `'universal-3-5-pro' is AssemblyAI's latest flagship model and is set to replace 'universal-3-pro'. See ${docsUrl}`
              : `'universal-3-5-pro' is AssemblyAI's latest flagship model. See ${docsUrl}`,
        });
      }
    }

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
      body.keyterms_prompt = assemblyaiOptions.keytermsPrompt ?? undefined;
      body.prompt = assemblyaiOptions.prompt ?? undefined;
      body.temperature = assemblyaiOptions.temperature ?? undefined;
      body.remove_audio_tags = assemblyaiOptions.removeAudioTags ?? undefined;
      body.domain = assemblyaiOptions.domain ?? undefined;
      body.redact_pii_return_unredacted =
        assemblyaiOptions.redactPiiReturnUnredacted ?? undefined;
      body.redact_static_entities =
        assemblyaiOptions.redactStaticEntities ?? undefined;

      if (assemblyaiOptions.speakerOptions) {
        body.speaker_options = {
          min_speakers_expected:
            assemblyaiOptions.speakerOptions.minSpeakersExpected ?? undefined,
          max_speakers_expected:
            assemblyaiOptions.speakerOptions.maxSpeakersExpected ?? undefined,
        };
      }

      if (assemblyaiOptions.languageDetectionOptions) {
        body.language_detection_options = {
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
        };
      }

      if (assemblyaiOptions.redactPiiAudioOptions) {
        body.redact_pii_audio_options = {
          return_redacted_no_speech_audio:
            assemblyaiOptions.redactPiiAudioOptions
              .returnRedactedNoSpeechAudio ?? undefined,
          override_audio_redaction_method:
            assemblyaiOptions.redactPiiAudioOptions
              .overrideAudioRedactionMethod ?? undefined,
        };
      }

      const deprecatedBoostOptions: string[] = [];
      if (assemblyaiOptions.wordBoost != null) {
        deprecatedBoostOptions.push('wordBoost');
      }
      if (assemblyaiOptions.boostParam != null) {
        deprecatedBoostOptions.push('boostParam');
      }
      if (deprecatedBoostOptions.length > 0) {
        warnings.push({
          type: 'other',
          message: `${deprecatedBoostOptions.join(', ')} ${
            deprecatedBoostOptions.length > 1 ? 'are' : 'is'
          } deprecated and rejected by 'universal-3-pro' / 'universal-3-5-pro' and 'slam-1'. Use 'keytermsPrompt' instead.`,
        });
      }

      // The following options only take effect alongside a prerequisite
      // option; without it AssemblyAI either rejects the request (400) or
      // silently ignores the option. Warn rather than mutate user input.
      if (
        (assemblyaiOptions.redactPiiReturnUnredacted != null ||
          assemblyaiOptions.redactStaticEntities != null) &&
        !assemblyaiOptions.redactPii
      ) {
        warnings.push({
          type: 'other',
          message:
            "'redactPiiReturnUnredacted' and 'redactStaticEntities' require 'redactPii' to be enabled; AssemblyAI rejects the request otherwise.",
        });
      }
      if (
        assemblyaiOptions.redactPiiAudioOptions != null &&
        !assemblyaiOptions.redactPiiAudio
      ) {
        warnings.push({
          type: 'other',
          message:
            "'redactPiiAudioOptions' only applies when 'redactPiiAudio' is enabled; it is otherwise ignored.",
        });
      }
      if (
        assemblyaiOptions.languageCode != null &&
        assemblyaiOptions.languageDetection
      ) {
        warnings.push({
          type: 'other',
          message:
            "'languageDetection' cannot be combined with an explicit 'languageCode'; AssemblyAI rejects requests that set both.",
        });
      }
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
    rawTranscript: unknown;
    responseHeaders: Record<string, string>;
  }> {
    const pollingInterval =
      this.config.pollingInterval ?? this.POLLING_INTERVAL_MS;

    // Honor a caller-provided fetch (proxy, auth injection, tests) for the
    // polling GETs, matching the upload/submit calls that use config.fetch.
    const fetchImpl = this.config.fetch ?? globalThis.fetch;

    while (true) {
      if (abortSignal?.aborted) {
        throw new Error('Transcription request was aborted');
      }

      const response = await fetchImpl(
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

      const rawTranscript = await response.json();
      const transcript =
        assemblyaiTranscriptionResponseSchema.parse(rawTranscript);

      if (transcript.status === 'completed') {
        return {
          transcript,
          rawTranscript,
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

    const { transcript, rawTranscript, responseHeaders } =
      await this.waitForCompletion(
        submitResponse.id,
        options.headers,
        options.abortSignal,
      );

    // Surface diarization and audio-intelligence results that the AI SDK's
    // `segments` shape can't represent, keyed under `assemblyai`. Presence is
    // gated on the parsed transcript, but values are taken from the raw
    // response so no fields are stripped by the schema.
    //
    // NOTE: timings inside these objects (e.g. `utterances[].start`) are in
    // milliseconds, matching the AssemblyAI API — unlike the top-level
    // `segments`, whose `startSecond`/`endSecond` are in seconds.
    const raw = (rawTranscript ?? {}) as Record<string, unknown>;
    const assemblyaiMetadata: Record<string, unknown> = {};
    if (transcript.utterances != null) {
      assemblyaiMetadata.utterances = raw.utterances;
    }
    if (transcript.sentiment_analysis_results != null) {
      assemblyaiMetadata.sentimentAnalysisResults =
        raw.sentiment_analysis_results;
    }
    if (transcript.entities != null) {
      assemblyaiMetadata.entities = raw.entities;
    }
    if (transcript.content_safety_labels != null) {
      assemblyaiMetadata.contentSafetyLabels = raw.content_safety_labels;
    }
    if (transcript.iab_categories_result != null) {
      assemblyaiMetadata.iabCategoriesResult = raw.iab_categories_result;
    }
    if (transcript.auto_highlights_result != null) {
      assemblyaiMetadata.autoHighlightsResult = raw.auto_highlights_result;
    }

    const lastWordEndMs = transcript.words?.at(-1)?.end;

    return {
      text: transcript.text ?? '',
      // AssemblyAI returns word timings in milliseconds; the AI SDK reports
      // segment timings in seconds.
      segments:
        transcript.words?.map(word => ({
          text: word.text,
          startSecond: word.start / 1000,
          endSecond: word.end / 1000,
        })) ?? [],
      language: transcript.language_code ?? undefined,
      durationInSeconds:
        transcript.audio_duration ??
        (lastWordEndMs != null ? lastWordEndMs / 1000 : undefined),
      warnings,
      ...(Object.keys(assemblyaiMetadata).length > 0 && {
        providerMetadata: {
          assemblyai: assemblyaiMetadata,
        } as SharedV3ProviderMetadata,
      }),
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders, // Headers from final GET request
        body: rawTranscript, // Full raw response from final GET request
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

const assemblyaiWordSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  confidence: z.number().nullish(),
  // Speaker label (e.g. 'A', 'B') when speaker diarization is enabled, else null.
  speaker: z.string().nullish(),
  channel: z.string().nullish(),
});

const assemblyaiTranscriptionResponseSchema = z.object({
  id: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'error']),
  text: z.string().nullish(),
  language_code: z.string().nullish(),
  speech_model_used: z.string().nullish(),
  words: z.array(assemblyaiWordSchema).nullish(),
  // Speaker-diarized utterances (present when `speaker_labels` is enabled).
  utterances: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
        confidence: z.number().nullish(),
        speaker: z.string().nullish(),
        channel: z.string().nullish(),
        words: z.array(assemblyaiWordSchema).nullish(),
      }),
    )
    .nullish(),
  // Audio-intelligence results, present only when the matching feature is
  // enabled. Kept intentionally permissive (the full structures are also
  // available on the raw `response.body`).
  sentiment_analysis_results: z
    .array(
      z.object({
        text: z.string(),
        start: z.number().nullish(),
        end: z.number().nullish(),
        sentiment: z.string(),
        confidence: z.number().nullish(),
        speaker: z.string().nullish(),
      }),
    )
    .nullish(),
  entities: z
    .array(
      z.object({
        entity_type: z.string(),
        text: z.string(),
        start: z.number().nullish(),
        end: z.number().nullish(),
      }),
    )
    .nullish(),
  content_safety_labels: z.record(z.string(), z.any()).nullish(),
  iab_categories_result: z.record(z.string(), z.any()).nullish(),
  auto_highlights_result: z.record(z.string(), z.any()).nullish(),
  audio_duration: z.number().nullish(),
  error: z.string().nullish(),
});

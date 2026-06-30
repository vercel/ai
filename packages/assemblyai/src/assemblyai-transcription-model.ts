import type {
  TranscriptionModelV4,
  SharedV4Warning,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  extractResponseHeaders,
  parseProviderOptions,
  postJsonToApi,
  postToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AssemblyAIConfig } from './assemblyai-config';
import { assemblyaiFailedResponseHandler } from './assemblyai-error';
import { assemblyaiTranscriptionModelOptionsSchema } from './assemblyai-transcription-model-options';
import type { AssemblyAITranscriptionModelId } from './assemblyai-transcription-settings';
import type { AssemblyAITranscriptionAPITypes } from './assemblyai-api-types';

interface AssemblyAITranscriptionModelConfig extends AssemblyAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
  /**
   * The polling interval for checking transcript status in milliseconds.
   */
  pollingInterval?: number;
}

export class AssemblyAITranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';
  private readonly POLLING_INTERVAL_MS = 3000;

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: AssemblyAITranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AssemblyAITranscriptionModelId;
    config: AssemblyAITranscriptionModelConfig;
  }) {
    return new AssemblyAITranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: AssemblyAITranscriptionModelId,
    private readonly config: AssemblyAITranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

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
        type: 'deprecated',
        setting: `model '${this.modelId}'`,
        message:
          "The 'best' model is a legacy AssemblyAI model. Use 'universal-3-5-pro' instead. See documentation: https://www.assemblyai.com/docs/pre-recorded-audio/select-the-speech-model",
      });
    } else {
      body.speech_models = [this.modelId];
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
            this.config.headers?.(),
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
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();

    const { value: uploadResponse } = await postToApi({
      url: this.config.url({
        path: '/v2/upload',
        modelId: '',
      }),
      headers: {
        'Content-Type': 'application/octet-stream',
        ...combineHeaders(this.config.headers?.(), options.headers),
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
      headers: combineHeaders(this.config.headers?.(), options.headers),
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
    // `segments` shape can't represent. Only included when the corresponding
    // feature was enabled (and thus present in the response).
    const assemblyaiMetadata: Record<string, unknown> = {};
    if (transcript.utterances != null) {
      assemblyaiMetadata.utterances = transcript.utterances;
    }
    if (transcript.sentiment_analysis_results != null) {
      assemblyaiMetadata.sentimentAnalysisResults =
        transcript.sentiment_analysis_results;
    }
    if (transcript.entities != null) {
      assemblyaiMetadata.entities = transcript.entities;
    }
    if (transcript.content_safety_labels != null) {
      assemblyaiMetadata.contentSafetyLabels = transcript.content_safety_labels;
    }
    if (transcript.iab_categories_result != null) {
      assemblyaiMetadata.iabCategoriesResult = transcript.iab_categories_result;
    }
    if (transcript.auto_highlights_result != null) {
      assemblyaiMetadata.autoHighlightsResult =
        transcript.auto_highlights_result;
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
        } as SharedV4ProviderMetadata,
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

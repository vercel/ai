import {
  TranscriptionModelV2,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
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
const assemblyaiProviderOptionsSchema = z.object({
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
   * List of topics to identify in the transcription.
   */
  topics: z.array(z.string()).nullish(),
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
});

export type AssemblyAITranscriptionCallOptions = z.infer<
  typeof assemblyaiProviderOptionsSchema
>;

interface AssemblyAITranscriptionModelConfig extends AssemblyAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class AssemblyAITranscriptionModel implements TranscriptionModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: AssemblyAITranscriptionModelId,
    private readonly config: AssemblyAITranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV2['doGenerate']>[0]) {
    const warnings: TranscriptionModelV2CallWarning[] = [];

    // Parse provider options
    const assemblyaiOptions = await parseProviderOptions({
      provider: 'assemblyai',
      providerOptions,
      schema: assemblyaiProviderOptionsSchema,
    });

    const body: Omit<AssemblyAITranscriptionAPITypes, 'audio_url'> = {
      speech_model: this.modelId,
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
      body.topics = assemblyaiOptions.topics ?? undefined;
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

  async doGenerate(
    options: Parameters<TranscriptionModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>> {
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

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
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
        assemblyaiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text ?? '',
      segments:
        response.words?.map(word => ({
          text: word.text,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language: response.language_code ?? undefined,
      durationInSeconds:
        response.audio_duration ?? response.words?.at(-1)?.end ?? undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}

const assemblyaiUploadResponseSchema = z.object({
  upload_url: z.string(),
});

const assemblyaiTranscriptionResponseSchema = z.object({
  text: z.string().nullish(),
  language_code: z.string().nullish(),
  words: z
    .array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
      }),
    )
    .nullish(),
  audio_duration: z.number().nullish(),
});

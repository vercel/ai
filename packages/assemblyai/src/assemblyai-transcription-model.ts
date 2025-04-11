import {
  TranscriptionModelV1,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  postToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { AssemblyAIConfig } from './assemblyai-config';
import { assemblyaiFailedResponseHandler } from './assemblyai-error';
import { AssemblyAITranscriptionModelId } from './assemblyai-transcription-settings';
import { AssemblyAITranscriptionAPITypes } from './assemblyai-api-types';

// https://www.assemblyai.com/docs/api-reference/transcripts/submit
const assemblyaiProviderOptionsSchema = z.object({
  audioEndAt: z.number().int().nullish(),
  audioStartFrom: z.number().int().nullish(),
  autoChapters: z.boolean().nullish(),
  autoHighlights: z.boolean().nullish(),
  boostParam: z.enum(['low', 'default', 'high']).nullish(),
  contentSafety: z.boolean().nullish(),
  contentSafetyConfidence: z.number().int().min(25).max(100).nullish(),
  customSpelling: z
    .array(
      z.object({
        from: z.array(z.string()),
        to: z.string(),
      }),
    )
    .nullish(),
  disfluencies: z.boolean().nullish(),
  entityDetection: z.boolean().nullish(),
  filterProfanity: z.boolean().nullish(),
  formatText: z.boolean().nullish(),
  iabCategories: z.boolean().nullish(),
  languageCode: z
    .enum([
      'en',
      'en_au',
      'en_uk',
      'en_us',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'nl',
      'af',
      'sq',
      'am',
      'ar',
      'hy',
      'as',
      'az',
      'ba',
      'eu',
      'be',
      'bn',
      'bs',
      'br',
      'bg',
      'my',
      'ca',
      'zh',
      'hr',
      'cs',
      'da',
      'et',
      'fo',
      'fi',
      'gl',
      'ka',
      'el',
      'gu',
      'ht',
      'ha',
      'haw',
      'he',
      'hi',
      'hu',
      'is',
      'id',
      'ja',
      'jw',
      'kn',
      'kk',
      'km',
      'ko',
      'lo',
      'la',
      'lv',
      'ln',
      'lt',
      'lb',
      'mk',
      'mg',
      'ms',
      'ml',
      'mt',
      'mi',
      'mr',
      'mn',
      'ne',
      'no',
      'nn',
      'oc',
      'pa',
      'ps',
      'fa',
      'pl',
      'ro',
      'ru',
      'sa',
      'sr',
      'sn',
      'sd',
      'si',
      'sk',
      'sl',
      'so',
      'su',
      'sw',
      'sv',
      'tl',
      'tg',
      'ta',
      'tt',
      'te',
      'th',
      'bo',
      'tr',
      'tk',
      'uk',
      'ur',
      'uz',
      'vi',
      'cy',
      'yi',
      'yo',
    ])
    .nullish(),
  languageConfidenceThreshold: z.number().nullish(),
  languageDetection: z.boolean().nullish(),
  multichannel: z.boolean().nullish(),
  punctuate: z.boolean().nullish(),
  redactPii: z.boolean().nullish(),
  redactPiiAudio: z.boolean().nullish(),
  redactPiiAudioQuality: z.enum(['mp3', 'wav']).nullish(),
  redactPiiPolicies: z
    .array(
      z.enum([
        'account_number',
        'banking_information',
        'blood_type',
        'credit_card_cvv',
        'credit_card_expiration',
        'credit_card_number',
        'date',
        'date_interval',
        'date_of_birth',
        'drivers_license',
        'drug',
        'duration',
        'email_address',
        'event',
        'filename',
        'gender_sexuality',
        'healthcare_number',
        'injury',
        'ip_address',
        'language',
        'location',
        'marital_status',
        'medical_condition',
        'medical_process',
        'money_amount',
        'nationality',
        'number_sequence',
        'occupation',
        'organization',
        'passport_number',
        'password',
        'person_age',
        'person_name',
        'phone_number',
        'physical_attribute',
        'political_affiliation',
        'religion',
        'statistics',
        'time',
        'url',
        'us_social_security_number',
        'username',
        'vehicle_id',
        'zodiac_sign',
      ]),
    )
    .nullish(),
  redactPiiSub: z.enum(['entity_name', 'hash']).nullish(),
  sentimentAnalysis: z.boolean().nullish(),
  speakerLabels: z.boolean().nullish(),
  speakersExpected: z.number().int().nullish(),
  speechThreshold: z.number().min(0).max(1).nullish(),
  summarization: z.boolean().nullish(),
  summaryModel: z.enum(['informative', 'conversational', 'catchy']).nullish(),
  summaryType: z
    .enum(['bullets', 'bullets_verbose', 'gist', 'headline', 'paragraph'])
    .nullish(),
  topics: z.array(z.string()).nullish(),
  webhookAuthHeaderName: z.string().nullish(),
  webhookAuthHeaderValue: z.string().nullish(),
  webhookUrl: z.string().nullish(),
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

export class AssemblyAITranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: AssemblyAITranscriptionModelId,
    private readonly config: AssemblyAITranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    // Parse provider options
    const assemblyaiOptions = parseProviderOptions({
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
      body.boost_param = assemblyaiOptions.boostParam ?? undefined;
      body.content_safety = assemblyaiOptions.contentSafety ?? undefined;
      body.content_safety_confidence =
        assemblyaiOptions.contentSafetyConfidence ?? undefined;
      body.custom_spelling = assemblyaiOptions.customSpelling ?? undefined;
      body.disfluencies = assemblyaiOptions.disfluencies ?? undefined;
      body.entity_detection = assemblyaiOptions.entityDetection ?? undefined;
      body.filter_profanity = assemblyaiOptions.filterProfanity ?? undefined;
      body.format_text = assemblyaiOptions.formatText ?? undefined;
      body.iab_categories = assemblyaiOptions.iabCategories ?? undefined;
      body.language_code = assemblyaiOptions.languageCode ?? undefined;
      body.language_confidence_threshold =
        assemblyaiOptions.languageConfidenceThreshold ?? undefined;
      body.language_detection =
        assemblyaiOptions.languageDetection ?? undefined;
      body.multichannel = assemblyaiOptions.multichannel ?? undefined;
      body.punctuate = assemblyaiOptions.punctuate ?? undefined;
      body.redact_pii = assemblyaiOptions.redactPii ?? undefined;
      body.redact_pii_audio = assemblyaiOptions.redactPiiAudio ?? undefined;
      body.redact_pii_audio_quality =
        assemblyaiOptions.redactPiiAudioQuality ?? undefined;
      body.redact_pii_policies =
        assemblyaiOptions.redactPiiPolicies ?? undefined;
      body.redact_pii_sub = assemblyaiOptions.redactPiiSub ?? undefined;
      body.sentiment_analysis =
        assemblyaiOptions.sentimentAnalysis ?? undefined;
      body.speaker_labels = assemblyaiOptions.speakerLabels ?? undefined;
      body.speakers_expected = assemblyaiOptions.speakersExpected ?? undefined;
      body.speech_threshold = assemblyaiOptions.speechThreshold ?? undefined;
      body.summarization = assemblyaiOptions.summarization ?? undefined;
      body.summary_model = assemblyaiOptions.summaryModel ?? undefined;
      body.summary_type = assemblyaiOptions.summaryType ?? undefined;
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
    options: Parameters<TranscriptionModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV1['doGenerate']>>> {
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
  id: z.string(),
  upload_url: z.string(),
});

const assemblyaiTranscriptionResponseSchema = z.object({
  id: z.string(),
  audio_url: z.string(),
  status: z.enum(['queued', 'processing', 'completed', 'error']),
  webhook_auth: z.boolean(),
  auto_highlights: z.boolean(),
  redact_pii: z.boolean(),
  summarization: z.boolean(),
  language_code: z
    .enum([
      'en',
      'en_au',
      'en_uk',
      'en_us',
      'es',
      'fr',
      'de',
      'it',
      'pt',
      'nl',
      'af',
      'sq',
      'am',
      'ar',
      'hy',
      'as',
      'az',
      'ba',
      'eu',
      'be',
      'bn',
      'bs',
      'br',
      'bg',
      'my',
      'ca',
      'zh',
      'hr',
      'cs',
      'da',
      'et',
      'fo',
      'fi',
      'gl',
      'ka',
      'el',
      'gu',
      'ht',
      'ha',
      'haw',
      'he',
      'hi',
      'hu',
      'is',
      'id',
      'ja',
      'jw',
      'kn',
      'kk',
      'km',
      'ko',
      'lo',
      'la',
      'lv',
      'ln',
      'lt',
      'lb',
      'mk',
      'mg',
      'ms',
      'ml',
      'mt',
      'mi',
      'mr',
      'mn',
      'ne',
      'no',
      'nn',
      'oc',
      'pa',
      'ps',
      'fa',
      'pl',
      'ro',
      'ru',
      'sa',
      'sr',
      'sn',
      'sd',
      'si',
      'sk',
      'sl',
      'so',
      'su',
      'sw',
      'sv',
      'tl',
      'tg',
      'ta',
      'tt',
      'te',
      'th',
      'bo',
      'tr',
      'tk',
      'uk',
      'ur',
      'uz',
      'vi',
      'cy',
      'yi',
      'yo',
    ])
    .nullish(),
  language_detection: z.boolean().nullish(),
  language_confidence_threshold: z.number().nullish(),
  language_confidence: z.number().min(0).max(1).nullish(),
  speech_model: z.enum(['best', 'nano']).nullish(),
  text: z.string().nullish(),
  words: z
    .array(
      z.object({
        confidence: z.number().min(0).max(1),
        start: z.number(),
        end: z.number(),
        text: z.string(),
        channel: z.string().nullish(),
        speaker: z.string().nullish(),
      }),
    )
    .nullish(),
  utterances: z
    .array(
      z.object({
        confidence: z.number().min(0).max(1),
        start: z.number(),
        end: z.number(),
        text: z.string(),
        words: z.array(
          z.object({
            confidence: z.number().min(0).max(1),
            start: z.number(),
            end: z.number(),
            text: z.string(),
            channel: z.string().nullish(),
            speaker: z.string().nullish(),
          }),
        ),
        speaker: z.string(),
        channel: z.string().nullish(),
      }),
    )
    .nullish(),
  confidence: z.number().min(0).max(1).nullish(),
  audio_duration: z.number().nullish(),
  punctuate: z.boolean().nullish(),
  format_text: z.boolean().nullish(),
  disfluencies: z.boolean().nullish(),
  multichannel: z.boolean().nullish(),
  audio_channels: z.number().nullish(),
  webhook_url: z.string().nullish(),
  webhook_status_code: z.number().nullish(),
  webhook_auth_header_name: z.string().nullish(),
  auto_highlights_result: z
    .object({
      status: z.enum(['success', 'unavailable']),
      results: z.array(
        z.object({
          count: z.number(),
          rank: z.number(),
          text: z.string(),
          timestamps: z.array(
            z.object({
              start: z.number(),
              end: z.number(),
            }),
          ),
        }),
      ),
    })
    .nullish(),
  audio_start_from: z.number().nullish(),
  audio_end_at: z.number().nullish(),
  word_boost: z.array(z.string()).nullish(),
  boost_param: z.string().nullish(),
  filter_profanity: z.boolean().nullish(),
  redact_pii_audio: z.boolean().nullish(),
  redact_pii_audio_quality: z.enum(['mp3', 'wav']).nullish(),
  redact_pii_policies: z
    .array(
      z.enum([
        'account_number',
        'banking_information',
        'blood_type',
        'credit_card_cvv',
        'credit_card_expiration',
        'credit_card_number',
        'date',
        'date_interval',
        'date_of_birth',
        'drivers_license',
        'drug',
        'duration',
        'email_address',
        'event',
        'filename',
        'gender_sexuality',
        'healthcare_number',
        'injury',
        'ip_address',
        'language',
        'location',
        'marital_status',
        'medical_condition',
        'medical_process',
        'money_amount',
        'nationality',
        'number_sequence',
        'occupation',
        'organization',
        'passport_number',
        'password',
        'person_age',
        'person_name',
        'phone_number',
        'physical_attribute',
        'political_affiliation',
        'religion',
        'statistics',
        'time',
        'url',
        'us_social_security_number',
        'username',
        'vehicle_id',
        'zodiac_sign',
      ]),
    )
    .nullish(),
  redact_pii_sub: z.enum(['entity_name', 'hash']).nullish(),
  speaker_labels: z.boolean().nullish(),
  speakers_expected: z.number().nullish(),
  content_safety: z.boolean().nullish(),
  content_safety_labels: z
    .object({
      status: z.enum(['success', 'unavailable']),
      results: z.array(
        z.object({
          text: z.string(),
          labels: z.array(
            z.object({
              label: z.string(),
              confidence: z.number().min(0).max(1),
              severity: z.number().min(0).max(1),
            }),
          ),
          sentences_idx_start: z.number(),
          sentences_idx_end: z.number(),
          timestamp: z.object({
            start: z.number(),
            end: z.number(),
          }),
        }),
      ),
      summary: z.record(z.string(), z.number()),
      severity_score_summary: z.record(
        z.string(),
        z.object({
          low: z.number().min(0).max(1),
          medium: z.number().min(0).max(1),
          high: z.number().min(0).max(1),
        }),
      ),
    })
    .nullish(),
  iab_categories: z.boolean().nullish(),
  iab_categories_result: z
    .object({
      status: z.enum(['success', 'unavailable']),
      results: z.array(
        z.object({
          text: z.string(),
          labels: z
            .array(
              z.object({
                relevance: z.number().min(0).max(1),
                label: z.string(),
              }),
            )
            .nullish(),
          timestamp: z
            .object({
              start: z.number(),
              end: z.number(),
            })
            .nullish(),
        }),
      ),
      summary: z.record(z.string(), z.number()),
    })
    .nullish(),
  custom_spelling: z
    .array(
      z.object({
        from: z.array(z.string()),
        to: z.string(),
      }),
    )
    .nullish(),
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
  summary_type: z.string().nullish(),
  summary_model: z.string().nullish(),
  summary: z.string().nullish(),
  topics: z.array(z.string()).nullish(),
  sentiment_analysis: z.boolean().nullish(),
  sentiment_analysis_results: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
        sentiment: z.enum(['POSITIVE', 'NEUTRAL', 'NEGATIVE']),
        confidence: z.number().min(0).max(1),
        channel: z.string().nullish(),
        speaker: z.string().nullish(),
      }),
    )
    .nullish(),
  entity_detection: z.boolean().nullish(),
  entities: z
    .array(
      z.object({
        entity_type: z.enum([
          'account_number',
          'banking_information',
          'blood_type',
          'credit_card_cvv',
          'credit_card_expiration',
          'credit_card_number',
          'date',
          'date_interval',
          'date_of_birth',
          'drivers_license',
          'drug',
          'duration',
          'email_address',
          'event',
          'filename',
          'gender_sexuality',
          'healthcare_number',
          'injury',
          'ip_address',
          'language',
          'location',
          'marital_status',
          'medical_condition',
          'medical_process',
          'money_amount',
          'nationality',
          'number_sequence',
          'occupation',
          'organization',
          'passport_number',
          'password',
          'person_age',
          'person_name',
          'phone_number',
          'physical_attribute',
          'political_affiliation',
          'religion',
          'statistics',
          'time',
          'url',
          'us_social_security_number',
          'username',
          'vehicle_id',
          'zodiac_sign',
        ]),
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
  speech_threshold: z.number().nullish(),
  throttled: z.boolean().nullish(),
  error: z.string().nullish(),
});

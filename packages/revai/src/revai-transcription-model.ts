import {
  TranscriptionModelV1,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  getFromApi,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { RevaiConfig } from './revai-config';
import { revaiFailedResponseHandler } from './revai-error';
import { RevaiTranscriptionModelId } from './revai-transcription-settings';
import { RevaiTranscriptionAPITypes } from './revai-api-types';

// https://docs.rev.ai/api/asynchronous/reference/#operation/SubmitTranscriptionJob
const revaiProviderOptionsSchema = z.object({  
  metadata: z.string().nullish(),
  notification_config: z.object({
    url: z.string(),
    auth_headers: z.object({
      Authorization: z.string()
    }).nullish()
  }).nullish(),
  delete_after_seconds: z.number().nullish(),
  verbatim: z.boolean().optional(),
  rush: z.boolean().nullish().default(false),
  test_mode: z.boolean().nullish().default(false),
  segments_to_transcribe: z.array(z.object({
    start: z.number(),
    end: z.number()
  })).nullish(),
  speaker_names: z.array(z.object({
    display_name: z.string()
  })).nullish(),
  skip_diarization: z.boolean().nullish().default(false),
  skip_postprocessing: z.boolean().nullish().default(false),
  skip_punctuation: z.boolean().nullish().default(false),
  remove_disfluencies: z.boolean().nullish().default(false),
  remove_atmospherics: z.boolean().nullish().default(false),
  filter_profanity: z.boolean().nullish().default(false),
  speaker_channels_count: z.number().nullish(),
  speakers_count: z.number().nullish(),
  diarization_type: z.enum(["standard", "premium"]).nullish().default("standard"),
  custom_vocabulary_id: z.string().nullish(),
  custom_vocabularies: z.array(z.object({})).optional(),
  strict_custom_vocabulary: z.boolean().optional(),
  summarization_config: z.object({
    model: z.enum(["standard", "premium"]).nullish().default("standard"),
    type: z.enum(["paragraph", "bullets"]).nullish().default("paragraph"),
    prompt: z.string().nullish()
  }).nullish(),
  translation_config: z.object({
    target_languages: z.array(z.object({
      language: z.enum([
        "en", "en-us", "en-gb", "ar", "pt", "pt-br", "pt-pt", 
        "fr", "fr-ca", "es", "es-es", "es-la", "it", "ja", 
        "ko", "de", "ru"
      ])
    })),
    model: z.enum(["standard", "premium"]).nullish().default("standard")
  }).nullish(),
  language: z.string().nullish().default("en"),
  forced_alignment: z.boolean().nullish().default(false)
});

export type RevaiTranscriptionCallOptions = z.infer<
  typeof revaiProviderOptionsSchema
>;

interface RevaiTranscriptionModelConfig extends RevaiConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class RevaiTranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: RevaiTranscriptionModelId,
    private readonly config: RevaiTranscriptionModelConfig,
  ) {}

  private getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    // Parse provider options
    const revaiOptions = parseProviderOptions({
      provider: 'revai',
      providerOptions,
      schema: revaiProviderOptionsSchema,
    });

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('media', new File([blob], 'audio', { type: mediaType }));
    const transcriptionModelOptions: RevaiTranscriptionAPITypes = {
      transcriber: this.modelId,
    };

    // Add provider-specific options
    if (revaiOptions) {
      const formDataConfig: RevaiTranscriptionAPITypes = {
        metadata: revaiOptions.metadata ?? undefined,
        notification_config: revaiOptions.notification_config ?? undefined,
        delete_after_seconds: revaiOptions.delete_after_seconds ?? undefined,
        verbatim: revaiOptions.verbatim ?? undefined,
        rush: revaiOptions.rush ?? undefined,
        test_mode: revaiOptions.test_mode ?? undefined,
        segments_to_transcribe: revaiOptions.segments_to_transcribe ?? undefined,
        speaker_names: revaiOptions.speaker_names ?? undefined,
        skip_diarization: revaiOptions.skip_diarization ?? undefined,
        skip_postprocessing: revaiOptions.skip_postprocessing ?? undefined,
        skip_punctuation: revaiOptions.skip_punctuation ?? undefined,
        remove_disfluencies: revaiOptions.remove_disfluencies ?? undefined,
        remove_atmospherics: revaiOptions.remove_atmospherics ?? undefined,
        filter_profanity: revaiOptions.filter_profanity ?? undefined,
        speaker_channels_count: revaiOptions.speaker_channels_count ?? undefined,
        speakers_count: revaiOptions.speakers_count ?? undefined,
        diarization_type: revaiOptions.diarization_type ?? undefined,
        custom_vocabulary_id: revaiOptions.custom_vocabulary_id ?? undefined,
        custom_vocabularies: revaiOptions.custom_vocabularies ?? undefined,
        strict_custom_vocabulary: revaiOptions.strict_custom_vocabulary ?? undefined,
        summarization_config: revaiOptions.summarization_config ?? undefined,
        translation_config: revaiOptions.translation_config ?? undefined,
        language: revaiOptions.language ?? undefined,
        forced_alignment: revaiOptions.forced_alignment ?? undefined,
      };

      for (const key in formDataConfig) {
        const value =
          formDataConfig[
            key as keyof RevaiTranscriptionAPITypes
          ];
        if (value !== undefined) {
          (transcriptionModelOptions as Record<string, unknown>)[
            key as keyof RevaiTranscriptionAPITypes
          ] = value;
        }
      }
    }

    formData.append('config', JSON.stringify(transcriptionModelOptions));

    return {
      formData,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = this.getArgs(options);

    const {
      value: submissionResponse,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/speechtotext/v1/jobs',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: revaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        revaiTranscriptionJobResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (submissionResponse.status !== 'transcribed') {
      throw new Error('Transcription job failed');
    }

    const jobId = submissionResponse.id;
    const timeoutMs = 60 * 1000; // 60 seconds timeout
    const startTime = Date.now();
    let jobResponse = submissionResponse;

    while (jobResponse.status !== 'transcribed') {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new Error('Transcription job polling timed out after 60 seconds');
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Poll for job status
      const pollingResult = await getFromApi({
        url: this.config.url({
          path: `/speechtotext/v1/jobs/${jobId}`,
          modelId: this.modelId,
        }),
        headers: combineHeaders(this.config.headers(), options.headers),
        failedResponseHandler: revaiFailedResponseHandler,
        successfulResponseHandler: createJsonResponseHandler(
          revaiTranscriptionJobResponseSchema,
        ),
        abortSignal: options.abortSignal,
        fetch: this.config.fetch,
      });
      
      jobResponse = pollingResult.value;
      
      if (jobResponse.status === 'failed') {
        throw new Error('Transcription job failed during polling');
      }
    }
    
    // Fetch the completed transcription
    const transcriptionResult = await getFromApi({
      url: this.config.url({
        path: `/speechtotext/v1/jobs/${jobId}/transcript`,
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      failedResponseHandler: revaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        revaiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const transcriptionSummaryResult = await getFromApi({
      url: this.config.url({
        path: `/speechtotext/v1/jobs/${jobId}/transcript/summary`,
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      failedResponseHandler: revaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        revaiTranscriptionSummaryResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });
    
    if (!transcriptionSummaryResult.rawValue) {
      throw new Error('Transcription summary not found');
    }

    return {
      text: transcriptionSummaryResult.value,
      segments: transcriptionResult.value.monologues
        .map(monologue =>
          monologue.elements.map(element => ({
            text: element.value,
            startSecond: element.ts ?? 0,
            endSecond: element.end_ts ?? 0,
          })),
        )
        .flat(),
      language: submissionResponse.language,
      durationInSeconds:
        transcriptionResult.value.monologues.at(-1)?.elements.at(-1)?.end_ts ??
        undefined,
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

const revaiTranscriptionJobResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  language: z.string(),
  created_on: z.string(),
  transcriber: z.string()
});

const revaiTranscriptionResponseSchema = z.object({
  monologues: z.array(
    z.object({
      speaker: z.number(),
      elements: z.array(
        z.object({
          type: z.union([z.literal('text'), z.literal('punct'), z.literal('unknown')]),
          value: z.string(),
          ts: z.number().optional(),
          end_ts: z.number().optional(),
          confidence: z.number().optional()
        })
      )
    })
  )
});

const revaiTranscriptionSummaryResponseSchema = z.string();
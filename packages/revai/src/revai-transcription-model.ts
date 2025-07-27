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
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { RevaiConfig } from './revai-config';
import { revaiFailedResponseHandler } from './revai-error';
import { RevaiTranscriptionModelId } from './revai-transcription-options';
import { RevaiTranscriptionAPITypes } from './revai-api-types';

// https://docs.rev.ai/api/asynchronous/reference/#operation/SubmitTranscriptionJob
const revaiProviderOptionsSchema = z.object({
  /**
   * Optional metadata string to associate with the transcription job.
   */
  metadata: z.string().nullish(),
  /**
   * Configuration for webhook notifications when job is complete.
   */
  notification_config: z
    .object({
      /**
       * URL to send the notification to.
       */
      url: z.string(),
      /**
       * Optional authorization headers for the notification request.
       */
      auth_headers: z
        .object({
          Authorization: z.string(),
        })
        .nullish(),
    })
    .nullish(),
  /**
   * Number of seconds after which the job will be automatically deleted.
   */
  delete_after_seconds: z.number().nullish(),
  /**
   * Whether to include filler words and false starts in the transcription.
   */
  verbatim: z.boolean().optional(),
  /**
   * Whether to prioritize the job for faster processing.
   */
  rush: z.boolean().nullish().default(false),
  /**
   * Whether to run the job in test mode.
   */
  test_mode: z.boolean().nullish().default(false),
  /**
   * Specific segments of the audio to transcribe.
   */
  segments_to_transcribe: z
    .array(
      z.object({
        /**
         * Start time of the segment in seconds.
         */
        start: z.number(),
        /**
         * End time of the segment in seconds.
         */
        end: z.number(),
      }),
    )
    .nullish(),
  /**
   * Names to assign to speakers in the transcription.
   */
  speaker_names: z
    .array(
      z.object({
        /**
         * Display name for the speaker.
         */
        display_name: z.string(),
      }),
    )
    .nullish(),
  /**
   * Whether to skip speaker diarization.
   */
  skip_diarization: z.boolean().nullish().default(false),
  /**
   * Whether to skip post-processing steps.
   */
  skip_postprocessing: z.boolean().nullish().default(false),
  /**
   * Whether to skip adding punctuation to the transcription.
   */
  skip_punctuation: z.boolean().nullish().default(false),
  /**
   * Whether to remove disfluencies (um, uh, etc.) from the transcription.
   */
  remove_disfluencies: z.boolean().nullish().default(false),
  /**
   * Whether to remove atmospheric sounds from the transcription.
   */
  remove_atmospherics: z.boolean().nullish().default(false),
  /**
   * Whether to filter profanity from the transcription.
   */
  filter_profanity: z.boolean().nullish().default(false),
  /**
   * Number of speaker channels in the audio.
   */
  speaker_channels_count: z.number().nullish(),
  /**
   * Expected number of speakers in the audio.
   */
  speakers_count: z.number().nullish(),
  /**
   * Type of diarization to use.
   */
  diarization_type: z
    .enum(['standard', 'premium'])
    .nullish()
    .default('standard'),
  /**
   * ID of a custom vocabulary to use for the transcription.
   */
  custom_vocabulary_id: z.string().nullish(),
  /**
   * Custom vocabularies to use for the transcription.
   */
  custom_vocabularies: z.array(z.object({})).optional(),
  /**
   * Whether to strictly enforce custom vocabulary.
   */
  strict_custom_vocabulary: z.boolean().optional(),
  /**
   * Configuration for generating a summary of the transcription.
   */
  summarization_config: z
    .object({
      /**
       * Model to use for summarization.
       */
      model: z.enum(['standard', 'premium']).nullish().default('standard'),
      /**
       * Format of the summary.
       */
      type: z.enum(['paragraph', 'bullets']).nullish().default('paragraph'),
      /**
       * Custom prompt for the summarization.
       */
      prompt: z.string().nullish(),
    })
    .nullish(),
  /**
   * Configuration for translating the transcription.
   */
  translation_config: z
    .object({
      /**
       * Target languages for translation.
       */
      target_languages: z.array(
        z.object({
          /**
           * Language code for translation target.
           */
          language: z.enum([
            'en',
            'en-us',
            'en-gb',
            'ar',
            'pt',
            'pt-br',
            'pt-pt',
            'fr',
            'fr-ca',
            'es',
            'es-es',
            'es-la',
            'it',
            'ja',
            'ko',
            'de',
            'ru',
          ]),
        }),
      ),
      /**
       * Model to use for translation.
       */
      model: z.enum(['standard', 'premium']).nullish().default('standard'),
    })
    .nullish(),
  /**
   * Language of the audio content.
   */
  language: z.string().nullish().default('en'),
  /**
   * Whether to perform forced alignment.
   */
  forced_alignment: z.boolean().nullish().default(false),
});

export type RevaiTranscriptionCallOptions = z.infer<
  typeof revaiProviderOptionsSchema
>;

interface RevaiTranscriptionModelConfig extends RevaiConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class RevaiTranscriptionModel implements TranscriptionModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: RevaiTranscriptionModelId,
    private readonly config: RevaiTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV2['doGenerate']>[0]) {
    const warnings: TranscriptionModelV2CallWarning[] = [];

    // Parse provider options
    const revaiOptions = await parseProviderOptions({
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
        segments_to_transcribe:
          revaiOptions.segments_to_transcribe ?? undefined,
        speaker_names: revaiOptions.speaker_names ?? undefined,
        skip_diarization: revaiOptions.skip_diarization ?? undefined,
        skip_postprocessing: revaiOptions.skip_postprocessing ?? undefined,
        skip_punctuation: revaiOptions.skip_punctuation ?? undefined,
        remove_disfluencies: revaiOptions.remove_disfluencies ?? undefined,
        remove_atmospherics: revaiOptions.remove_atmospherics ?? undefined,
        filter_profanity: revaiOptions.filter_profanity ?? undefined,
        speaker_channels_count:
          revaiOptions.speaker_channels_count ?? undefined,
        speakers_count: revaiOptions.speakers_count ?? undefined,
        diarization_type: revaiOptions.diarization_type ?? undefined,
        custom_vocabulary_id: revaiOptions.custom_vocabulary_id ?? undefined,
        custom_vocabularies: revaiOptions.custom_vocabularies ?? undefined,
        strict_custom_vocabulary:
          revaiOptions.strict_custom_vocabulary ?? undefined,
        summarization_config: revaiOptions.summarization_config ?? undefined,
        translation_config: revaiOptions.translation_config ?? undefined,
        language: revaiOptions.language ?? undefined,
        forced_alignment: revaiOptions.forced_alignment ?? undefined,
      };

      for (const key in formDataConfig) {
        const value = formDataConfig[key as keyof RevaiTranscriptionAPITypes];
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
    options: Parameters<TranscriptionModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const { value: submissionResponse } = await postFormDataToApi({
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

    if (submissionResponse.status === 'failed') {
      throw new AISDKError({
        message: 'Failed to submit transcription job to Rev.ai',
        name: 'TranscriptionJobSubmissionFailed',
        cause: submissionResponse,
      });
    }

    const jobId = submissionResponse.id;
    const timeoutMs = 60 * 1000; // 60 seconds timeout
    const startTime = Date.now();
    const pollingInterval = 1000;
    let jobResponse = submissionResponse;

    while (jobResponse.status !== 'transcribed') {
      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new AISDKError({
          message: 'Transcription job polling timed out',
          name: 'TranscriptionJobPollingTimedOut',
          cause: submissionResponse,
        });
      }

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
        throw new AISDKError({
          message: 'Transcription job failed',
          name: 'TranscriptionJobFailed',
          cause: jobResponse,
        });
      }

      // Wait before polling again (only if we need to continue polling)
      if (jobResponse.status !== 'transcribed') {
        await delay(pollingInterval);
      }
    }

    const {
      value: transcriptionResult,
      responseHeaders,
      rawValue: rawResponse,
    } = await getFromApi({
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

    let durationInSeconds = 0;
    const segments: {
      text: string;
      startSecond: number;
      endSecond: number;
    }[] = [];

    for (const monologue of transcriptionResult.monologues ?? []) {
      // Process each monologue to extract segments with timing information
      let currentSegmentText = '';
      let segmentStartSecond = 0;
      let hasStartedSegment = false;

      for (const element of monologue?.elements ?? []) {
        // Add the element value to the current segment text
        currentSegmentText += element.value;

        // For text elements, track timing information
        if (element.type === 'text') {
          // Update the overall duration if this is the latest timestamp
          if (element.end_ts && element.end_ts > durationInSeconds) {
            durationInSeconds = element.end_ts;
          }

          // If this is the first text element in a segment, mark the start time
          if (!hasStartedSegment && typeof element.ts === 'number') {
            segmentStartSecond = element.ts;
            hasStartedSegment = true;
          }

          // If we have an end timestamp, we can complete a segment
          if (typeof element.end_ts === 'number' && hasStartedSegment) {
            // Only add non-empty segments
            if (currentSegmentText.trim()) {
              segments.push({
                text: currentSegmentText.trim(),
                startSecond: segmentStartSecond,
                endSecond: element.end_ts,
              });
            }

            // Reset for the next segment
            currentSegmentText = '';
            hasStartedSegment = false;
          }
        }
      }

      // Handle any remaining segment text that wasn't added
      if (hasStartedSegment && currentSegmentText.trim()) {
        const endSecond =
          durationInSeconds > segmentStartSecond
            ? durationInSeconds
            : segmentStartSecond + 1;
        segments.push({
          text: currentSegmentText.trim(),
          startSecond: segmentStartSecond,
          endSecond: endSecond,
        });
      }
    }

    return {
      text:
        transcriptionResult.monologues
          ?.map(monologue =>
            monologue?.elements?.map(element => element.value).join(''),
          )
          .join(' ') ?? '',
      segments,
      language: submissionResponse.language ?? undefined,
      durationInSeconds,
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
  id: z.string().nullish(),
  status: z.string().nullish(),
  language: z.string().nullish(),
});

const revaiTranscriptionResponseSchema = z.object({
  monologues: z
    .array(
      z.object({
        elements: z
          .array(
            z.object({
              type: z.string().nullish(),
              value: z.string().nullish(),
              ts: z.number().nullish(),
              end_ts: z.number().nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .nullish(),
});

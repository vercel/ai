import {
  type SharedV4Warning,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  delay,
  mediaTypeToExtension,
  parseProviderOptions,
  safeParseJSON,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { AmazonTranscribeConfig } from './amazon-transcribe-config';
import { AmazonTranscribeError } from './amazon-transcribe-error';
import { amazonTranscribeTranscriptionModelOptionsSchema } from './amazon-transcribe-transcription-model-options';
import type { AmazonTranscribeTranscriptionModelId } from './amazon-transcribe-transcription-options';

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_DURATION_MS = 10 * 60 * 1000;

// Maps common audio media types to Amazon Transcribe `MediaFormat` values.
const MEDIA_TYPE_TO_FORMAT: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'mp4',
  'video/mp4': 'mp4',
  'audio/wav': 'wav',
  'audio/wave': 'wav',
  'audio/x-wav': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'video/webm': 'webm',
  'audio/amr': 'amr',
};

export class AmazonTranscribeTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: AmazonTranscribeTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: AmazonTranscribeTranscriptionModelId;
    config: AmazonTranscribeConfig;
  }) {
    return new AmazonTranscribeTranscriptionModel(
      options.modelId,
      options.config,
    );
  }

  constructor(
    readonly modelId: AmazonTranscribeTranscriptionModelId,
    private readonly config: AmazonTranscribeConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    const transcribeOptions = await parseProviderOptions({
      provider: 'amazonTranscribe',
      providerOptions,
      schema: amazonTranscribeTranscriptionModelOptionsSchema,
    });

    if (transcribeOptions == null) {
      throw new AmazonTranscribeError({
        message:
          'Amazon Transcribe requires provider options. Provide at least ' +
          '`providerOptions.amazonTranscribe.inputBucket` (the S3 bucket used to stage the audio).',
      });
    }

    const audioBytes =
      typeof audio === 'string' ? convertBase64ToUint8Array(audio) : audio;

    const jobName =
      transcribeOptions.transcriptionJobName ??
      `ai-sdk-${this.config.generateId()}`;

    const extension = mediaTypeToExtension(mediaType) ?? 'audio';
    const inputKey = `${transcribeOptions.inputKeyPrefix ?? ''}${jobName}.${extension}`;
    const mediaFormat =
      transcribeOptions.mediaFormat ?? MEDIA_TYPE_TO_FORMAT[mediaType];

    const startJobBody: Record<string, unknown> = {
      TranscriptionJobName: jobName,
      Media: {
        MediaFileUri: `s3://${transcribeOptions.inputBucket}/${inputKey}`,
      },
    };

    if (mediaFormat != null) {
      startJobBody.MediaFormat = mediaFormat;
    }

    if (transcribeOptions.mediaSampleRateHertz != null) {
      startJobBody.MediaSampleRateHertz =
        transcribeOptions.mediaSampleRateHertz;
    }

    // Language selection. Amazon Transcribe requires exactly one of
    // LanguageCode, IdentifyLanguage, or IdentifyMultipleLanguages.
    if (transcribeOptions.languageCode != null) {
      startJobBody.LanguageCode = transcribeOptions.languageCode;
    } else if (transcribeOptions.identifyMultipleLanguages) {
      startJobBody.IdentifyMultipleLanguages = true;
      if (transcribeOptions.languageOptions != null) {
        startJobBody.LanguageOptions = transcribeOptions.languageOptions;
      }
    } else if (transcribeOptions.identifyLanguage !== false) {
      // Default to single-language identification unless explicitly disabled.
      startJobBody.IdentifyLanguage = true;
      if (transcribeOptions.languageOptions != null) {
        startJobBody.LanguageOptions = transcribeOptions.languageOptions;
      }
    }

    if (transcribeOptions.outputBucket != null) {
      startJobBody.OutputBucketName = transcribeOptions.outputBucket;
      if (transcribeOptions.outputKey != null) {
        startJobBody.OutputKey = transcribeOptions.outputKey;
      }
    }

    if (transcribeOptions.settings != null) {
      startJobBody.Settings = transcribeOptions.settings;
    }

    // A non-default model id is treated as a custom language model name.
    if (this.modelId !== 'default') {
      startJobBody.ModelSettings = { LanguageModelName: this.modelId };
    }

    return {
      audioBytes,
      mediaType,
      jobName,
      inputBucket: transcribeOptions.inputBucket,
      inputKey,
      startJobBody,
      pollIntervalMillis:
        transcribeOptions.pollIntervalMillis ?? DEFAULT_POLL_INTERVAL_MS,
      maxPollDurationMillis:
        transcribeOptions.maxPollDurationMillis ?? DEFAULT_MAX_POLL_DURATION_MS,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const {
      audioBytes,
      mediaType,
      jobName,
      inputBucket,
      inputKey,
      startJobBody,
      pollIntervalMillis,
      maxPollDurationMillis,
      warnings,
    } = await this.getArgs(options);

    // Upload the audio to S3 so Amazon Transcribe can read it.
    const uploadUrl = this.config.s3ObjectUrl({
      bucket: inputBucket,
      key: inputKey,
    });
    const uploadResponse = await this.config.s3Fetch(uploadUrl, {
      method: 'PUT',
      headers: combineHeaders(this.config.headers(), options.headers, {
        'content-type': mediaType,
      }) as HeadersInit,
      body: audioBytes,
      signal: options.abortSignal,
    });

    if (!uploadResponse.ok) {
      throw new AmazonTranscribeError({
        message: `Failed to upload audio to S3 (status ${uploadResponse.status})`,
        cause: await safeReadText(uploadResponse),
      });
    }

    const requestBody = JSON.stringify(startJobBody);
    await this.callTranscribe('StartTranscriptionJob', requestBody, options);

    // Poll until the job completes or fails.
    const getJobBody = JSON.stringify({ TranscriptionJobName: jobName });
    const startTime = Date.now();
    let job = await this.callTranscribe(
      'GetTranscriptionJob',
      getJobBody,
      options,
    );

    while (
      job.value.TranscriptionJob.TranscriptionJobStatus !== 'COMPLETED' &&
      job.value.TranscriptionJob.TranscriptionJobStatus !== 'FAILED'
    ) {
      if (Date.now() - startTime > maxPollDurationMillis) {
        throw new AmazonTranscribeError({
          message: `Transcription job '${jobName}' polling timed out`,
          cause: job.value,
        });
      }

      await delay(pollIntervalMillis);

      job = await this.callTranscribe(
        'GetTranscriptionJob',
        getJobBody,
        options,
      );
    }

    if (job.value.TranscriptionJob.TranscriptionJobStatus === 'FAILED') {
      throw new AmazonTranscribeError({
        message: `Transcription job '${jobName}' failed: ${
          job.value.TranscriptionJob.FailureReason ?? 'unknown reason'
        }`,
        cause: job.value,
      });
    }

    const transcriptFileUri =
      job.value.TranscriptionJob.Transcript?.TranscriptFileUri;

    if (transcriptFileUri == null) {
      throw new AmazonTranscribeError({
        message: `Transcription job '${jobName}' completed without a transcript file URI`,
        cause: job.value,
      });
    }

    const transcript = await this.downloadTranscript(
      transcriptFileUri,
      options.abortSignal,
    );

    const result = mapTranscript(transcript);

    return {
      text: result.text,
      segments: result.segments,
      language:
        transcript.results?.language_code ??
        job.value.TranscriptionJob.LanguageCode ??
        undefined,
      durationInSeconds: result.durationInSeconds,
      warnings,
      request: { body: requestBody },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: job.headers,
        body: transcript,
      },
      providerMetadata: {
        amazonTranscribe: {
          transcriptionJobName: jobName,
        },
      },
    };
  }

  private async callTranscribe(
    target: 'StartTranscriptionJob' | 'GetTranscriptionJob',
    body: string,
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<{
    value: TranscriptionJobResponse;
    headers: Record<string, string>;
  }> {
    const response = await this.config.transcribeFetch(
      this.config.transcribeBaseUrl(),
      {
        method: 'POST',
        headers: combineHeaders(this.config.headers(), options.headers, {
          'content-type': 'application/x-amz-json-1.1',
          'x-amz-target': `Transcribe.${target}`,
        }) as HeadersInit,
        body,
        signal: options.abortSignal,
      },
    );

    const text = await response.text();

    if (!response.ok) {
      throw new AmazonTranscribeError({
        message: `Amazon Transcribe ${target} failed (status ${response.status})`,
        cause: text,
      });
    }

    const parsed = await safeParseJSON({
      text,
      schema: transcriptionJobResponseSchema,
    });

    if (!parsed.success) {
      throw new AmazonTranscribeError({
        message: `Failed to parse Amazon Transcribe ${target} response`,
        cause: parsed.error,
      });
    }

    return { value: parsed.value, headers: headersToRecord(response.headers) };
  }

  private async downloadTranscript(
    uri: string,
    abortSignal: AbortSignal | undefined,
  ): Promise<TranscriptFile> {
    // Service-managed output buckets return pre-signed URLs which must not be
    // re-signed. Customer-owned output buckets return plain S3 object URLs.
    const isPreSigned = /[?&]X-Amz-(Signature|Credential)=/.test(uri);
    const fetchImpl = isPreSigned
      ? (this.config.fetch ?? globalThis.fetch)
      : this.config.s3Fetch;

    const response = await fetchImpl(uri, {
      method: 'GET',
      signal: abortSignal,
    });

    const text = await response.text();

    if (!response.ok) {
      throw new AmazonTranscribeError({
        message: `Failed to download transcript (status ${response.status})`,
        cause: text,
      });
    }

    const parsed = await safeParseJSON({ text, schema: transcriptFileSchema });

    if (!parsed.success) {
      throw new AmazonTranscribeError({
        message: 'Failed to parse Amazon Transcribe transcript file',
        cause: parsed.error,
      });
    }

    return parsed.value;
  }
}

function mapTranscript(transcript: TranscriptFile): {
  text: string;
  segments: Array<{ text: string; startSecond: number; endSecond: number }>;
  durationInSeconds: number | undefined;
} {
  const results = transcript.results;
  const text = results?.transcripts?.[0]?.transcript ?? '';

  const segments: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }> = [];
  let durationInSeconds: number | undefined;

  // Prefer the segment-level output when available.
  if (results?.audio_segments?.length) {
    for (const segment of results.audio_segments) {
      const startSecond = toSeconds(segment.start_time);
      const endSecond = toSeconds(segment.end_time);

      if (segment.transcript != null) {
        segments.push({
          text: segment.transcript,
          startSecond: startSecond ?? 0,
          endSecond: endSecond ?? startSecond ?? 0,
        });
      }

      if (endSecond != null) {
        durationInSeconds = Math.max(durationInSeconds ?? 0, endSecond);
      }
    }
  } else if (results?.items?.length) {
    // Fall back to word-level items.
    for (const item of results.items) {
      const startSecond = toSeconds(item.start_time);
      const endSecond = toSeconds(item.end_time);
      const content = item.alternatives?.[0]?.content;

      if (item.type === 'pronunciation' && content != null) {
        segments.push({
          text: content,
          startSecond: startSecond ?? 0,
          endSecond: endSecond ?? startSecond ?? 0,
        });
      }

      if (endSecond != null) {
        durationInSeconds = Math.max(durationInSeconds ?? 0, endSecond);
      }
    }
  }

  return { text, segments, durationInSeconds };
}

function toSeconds(value: string | null | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function headersToRecord(headers: Headers): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
}

async function safeReadText(response: Response): Promise<string | undefined> {
  try {
    return await response.text();
  } catch {
    return undefined;
  }
}

const transcriptionJobResponseSchema = z.object({
  TranscriptionJob: z.object({
    TranscriptionJobName: z.string().nullish(),
    TranscriptionJobStatus: z.string().nullish(),
    LanguageCode: z.string().nullish(),
    MediaFormat: z.string().nullish(),
    FailureReason: z.string().nullish(),
    Transcript: z
      .object({
        TranscriptFileUri: z.string().nullish(),
      })
      .nullish(),
  }),
});

type TranscriptionJobResponse = z.infer<typeof transcriptionJobResponseSchema>;

const transcriptFileSchema = z.object({
  results: z
    .object({
      transcripts: z
        .array(z.object({ transcript: z.string().nullish() }))
        .nullish(),
      items: z
        .array(
          z.object({
            type: z.string().nullish(),
            start_time: z.string().nullish(),
            end_time: z.string().nullish(),
            alternatives: z
              .array(z.object({ content: z.string().nullish() }))
              .nullish(),
          }),
        )
        .nullish(),
      audio_segments: z
        .array(
          z.object({
            transcript: z.string().nullish(),
            start_time: z.string().nullish(),
            end_time: z.string().nullish(),
          }),
        )
        .nullish(),
      language_code: z.string().nullish(),
    })
    .nullish(),
});

type TranscriptFile = z.infer<typeof transcriptFileSchema>;

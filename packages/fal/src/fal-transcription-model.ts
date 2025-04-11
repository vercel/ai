import {
  TranscriptionModelV1,
  TranscriptionModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  postToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { FalConfig } from './fal-config';
import { falFailedResponseHandler } from './fal-error';
import { FalTranscriptionModelId } from './fal-transcription-settings';
import { FalTranscriptionAPITypes } from './fal-api-types';

// https://fal.ai/models/fal-ai/whisper/api?platform=http
const falProviderOptionsSchema = z.object({
  /**
   * Language of the audio file. If set to null, the language will be automatically detected. Defaults to null.
   *
   * If translate is selected as the task, the audio will be translated to English, regardless of the language selected.
   */
  language: z
    .enum([
      'af',
      'am',
      'ar',
      'as',
      'az',
      'ba',
      'be',
      'bg',
      'bn',
      'bo',
      'br',
      'bs',
      'ca',
      'cs',
      'cy',
      'da',
      'de',
      'el',
      'en',
      'es',
      'et',
      'eu',
      'fa',
      'fi',
      'fo',
      'fr',
      'gl',
      'gu',
      'ha',
      'haw',
      'he',
      'hi',
      'hr',
      'ht',
      'hu',
      'hy',
      'id',
      'is',
      'it',
      'ja',
      'jw',
      'ka',
      'kk',
      'km',
      'kn',
      'ko',
      'la',
      'lb',
      'ln',
      'lo',
      'lt',
      'lv',
      'mg',
      'mi',
      'mk',
      'ml',
      'mn',
      'mr',
      'ms',
      'mt',
      'my',
      'ne',
      'nl',
      'nn',
      'no',
      'oc',
      'pa',
      'pl',
      'ps',
      'pt',
      'ro',
      'ru',
      'sa',
      'sd',
      'si',
      'sk',
      'sl',
      'sn',
      'so',
      'sq',
      'sr',
      'su',
      'sv',
      'sw',
      'ta',
      'te',
      'tg',
      'th',
      'tk',
      'tl',
      'tr',
      'tt',
      'uk',
      'ur',
      'uz',
      'vi',
      'yi',
      'yo',
      'yue',
      'zh',
    ])
    .nullish(),

  /**
   * Whether to diarize the audio file. Defaults to false.
   */
  diarize: z.boolean().nullish(),

  /**
   * Level of the chunks to return. Either segment or word. Default value: "segment"
   */
  chunkLevel: z.enum(['segment', 'word']).nullish(),

  /**
   * Version of the model to use. All of the models are the Whisper large variant. Default value: "3"
   */
  version: z.enum(['3']).nullish(),

  /**
   * Default value: 64
   */
  batchSize: z.number().nullish(),

  /**
   * Number of speakers in the audio file. Defaults to null. If not provided, the number of speakers will be automatically detected.
   */
  numSpeakers: z.number().nullable().nullish(),
});

export type FalTranscriptionCallOptions = z.infer<
  typeof falProviderOptionsSchema
>;

interface FalTranscriptionModelConfig extends FalConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FalTranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: FalTranscriptionModelId,
    private readonly config: FalTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]) {
    const warnings: TranscriptionModelV1CallWarning[] = [];

    // Parse provider options
    const falOptions = parseProviderOptions({
      provider: 'fal',
      providerOptions,
      schema: falProviderOptionsSchema,
    });

    // Create form data with base fields
    const body: Omit<FalTranscriptionAPITypes, 'audio_url'> = {
      task: 'transcribe',
      diarize: true,
      chunk_level: 'word',
    };

    // Add provider-specific options
    if (falOptions) {
      body.language = falOptions.language;
      body.version = falOptions.version ?? undefined;
      body.batch_size = falOptions.batchSize ?? undefined;
      body.num_speakers = falOptions.numSpeakers ?? undefined;

      if (falOptions.diarize === false) {
        body.diarize = false;
      }

      if (falOptions.chunkLevel) {
        body.chunk_level = falOptions.chunkLevel;
      }
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
    const { body, warnings } = await this.getArgs(options);
    
    const { value: getUrlResponse } = await postJsonToApi({
      url: this.config.url({
        path: 'https://fal.run/storage/upload/initiate?storage_type=fal-cdn-v3',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        content_type: options.mediaType,
        file_name: `ai-sdk-${Date.now()}`,
      },
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        falGetUrlResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const { value: uploadResponse } = await postToApi({
      url: this.config.url({
        path: getUrlResponse.upload_url,
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
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler: createStatusCodeErrorResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    if (uploadResponse.statusCode !== 200) {
      throw new Error('Failed to upload audio');
    }

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: `https://queue.fal.run/fal-ai/${this.modelId}`,
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        audio_url: getUrlResponse.file_url,
      },
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        falTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.chunks?.map(chunk => ({
          text: chunk.text,
          startSecond: chunk.timestamp?.at(0) ?? 0,
          endSecond: chunk.timestamp?.at(1) ?? 0,
        })) ?? [],
      language: response.inferred_languages?.at(0) ?? undefined,
      durationInSeconds: response.chunks?.at(-1)?.timestamp?.at(1) ?? undefined,
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

const falGetUrlResponseSchema = z.object({
  upload_url: z.string(),
  file_url: z.string(),
});

const falTranscriptionResponseSchema = z.object({
  text: z.string(),
  chunks: z
    .array(
      z.object({
        text: z.string(),
        timestamp: z.array(z.number()).optional(),
        speaker: z.string().optional(),
      }),
    )
    .nullish(),
  inferred_languages: z.array(z.string()).nullish(),
  diarization_segments: z
    .array(
      z.object({
        timestamp: z.array(z.number()),
        speaker: z.string(),
      }),
    )
    .nullish(),
});

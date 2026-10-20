import type { SharedV4Warning, SpeechModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
  resolve,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { xaiFailedResponseHandler } from './xai-error';
import { xaiSpeechModelOptionsSchema } from './xai-speech-model-options';

interface XaiSpeechModelConfig {
  provider: string;
  baseURL: string | undefined;
  headers?: Resolvable<Record<string, string | undefined>>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

type XaiSpeechCodec = 'mp3' | 'wav' | 'pcm' | 'mulaw' | 'alaw';

export class XaiSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: XaiSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: '';
    config: XaiSpeechModelConfig;
  }) {
    return new XaiSpeechModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: '',
    private readonly config: XaiSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = 'eve',
    outputFormat = 'mp3',
    instructions,
    speed,
    language = 'auto',
    providerOptions,
  }: Parameters<SpeechModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];
    const xaiOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions,
      schema: xaiSpeechModelOptionsSchema,
    });

    let codec: XaiSpeechCodec = 'mp3';
    if (['mp3', 'wav', 'pcm', 'mulaw', 'alaw'].includes(outputFormat)) {
      codec = outputFormat as XaiSpeechCodec;
    } else {
      warnings.push({
        type: 'unsupported',
        feature: 'outputFormat',
        details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
      });
    }

    if (instructions != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'xAI speech models do not support the `instructions` option. ' +
          'Use xAI speech tags in `text` to control delivery.',
      });
    }

    const output_format: {
      codec: XaiSpeechCodec;
      sample_rate?: number;
      bit_rate?: number;
    } = {
      codec,
    };

    if (xaiOptions?.sampleRate != null) {
      output_format.sample_rate = xaiOptions.sampleRate;
    }

    if (xaiOptions?.bitRate != null) {
      if (codec === 'mp3') {
        output_format.bit_rate = xaiOptions.bitRate;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'providerOptions',
          details:
            'xAI `bitRate` is supported only for mp3 output. It was ignored.',
        });
      }
    }

    const requestBody = {
      text,
      voice_id: voice,
      language,
      output_format,
      speed,
      optimize_streaming_latency: xaiOptions?.optimizeStreamingLatency,
      text_normalization: xaiOptions?.textNormalization,
      with_timestamps: xaiOptions?.withTimestamps,
      replace: xaiOptions?.replace,
    };

    return {
      requestBody,
      warnings,
      withTimestamps: xaiOptions?.withTimestamps === true,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings, withTimestamps } =
      await this.getArgs(options);

    // With `with_timestamps` the API returns a JSON envelope carrying
    // base64-encoded audio plus character-level timings instead of raw
    // audio bytes.
    const { value, responseHeaders, rawValue } = await postJsonToApi<
      Uint8Array | XaiSpeechTimestampsResponse
    >({
      url: `${this.config.baseURL}/tts`,
      headers: combineHeaders(
        this.config.headers ? await resolve(this.config.headers) : undefined,
        options.headers,
      ),
      body: requestBody,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: withTimestamps
        ? createJsonResponseHandler(xaiSpeechTimestampsResponseSchema)
        : createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    let audio: Uint8Array;
    let envelope: XaiSpeechTimestampsResponse | undefined;
    if (value instanceof Uint8Array) {
      audio = value;
    } else {
      envelope = value;
      // Empty audio is returned as-is so the core layer throws
      // NoSpeechGeneratedError.
      audio =
        envelope.audio != null
          ? convertBase64ToUint8Array(envelope.audio)
          : new Uint8Array(0);
    }

    // xAI returns a trace id on every response (success and error).
    const traceId = responseHeaders?.['x-trace-id'];

    return {
      audio,
      warnings,
      request: {
        body: JSON.stringify(requestBody),
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawValue,
      },
      providerMetadata: {
        xai: {
          ...(traceId != null ? { traceId } : {}),
          ...(envelope?.duration != null
            ? { duration: envelope.duration }
            : {}),
          ...(envelope?.content_type != null
            ? { contentType: envelope.content_type }
            : {}),
          ...(envelope?.audio_timestamps != null
            ? {
                audioTimestamps: {
                  graphChars: envelope.audio_timestamps.graph_chars,
                  graphTimes: envelope.audio_timestamps.graph_times,
                },
              }
            : {}),
        },
      },
    };
  }
}

// Minimal schema for the `with_timestamps` JSON envelope: only the fields
// the implementation reads, with `.nullish()` so provider API changes don't
// break parsing.
const xaiSpeechTimestampsResponseSchema = z.object({
  audio: z.string().nullish(),
  content_type: z.string().nullish(),
  duration: z.number().nullish(),
  audio_timestamps: z
    .object({
      graph_chars: z.array(z.string()),
      graph_times: z.array(z.tuple([z.number(), z.number()])),
    })
    .nullish(),
});

type XaiSpeechTimestampsResponse = z.infer<
  typeof xaiSpeechTimestampsResponseSchema
>;

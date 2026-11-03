import {
  InvalidArgumentError,
  type TranscriptionModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  resolve,
  combineHeaders,
  convertBase64ToUint8Array,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  serializeModelOptions,
  type ResponseHandler,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GroqConfig } from './groq-config';
import { groqFailedResponseHandler } from './groq-error';
import {
  groqTranscriptionModelOptions,
  type GroqTranscriptionModelId,
} from './groq-transcription-model-options';
import type { GroqTranscriptionAPITypes } from './groq-api-types';

type GroqTranscriptionCallOptions =
  | Parameters<TranscriptionModelV4['doGenerate']>[0]
  | (Parameters<NonNullable<TranscriptionModelV4['doGenerateFromUrl']>>[0] & {
      mediaType?: undefined;
    });

interface GroqTranscriptionModelConfig extends GroqConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class GroqTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: GroqTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GroqTranscriptionModelId;
    config: GroqTranscriptionModelConfig;
  }) {
    return new GroqTranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: GroqTranscriptionModelId,
    private readonly config: GroqTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: GroqTranscriptionCallOptions) {
    const warnings: SharedV4Warning[] = [];

    // Parse provider options
    const groqOptions = await parseProviderOptions({
      provider: 'groq',
      providerOptions,
      schema: groqTranscriptionModelOptions,
    });

    // Create form data with base fields
    const formData = new FormData();
    formData.append('model', this.modelId);
    if (audio instanceof URL) {
      if (
        !['https:', 'http:'].includes(audio.protocol) ||
        audio.username !== '' ||
        audio.password !== '' ||
        audio.hash !== ''
      ) {
        throw new InvalidArgumentError({
          argument: 'audio',
          message:
            'Groq URL transcription requires an HTTP(S) URL without userinfo or fragments.',
        });
      }
      formData.append('url', audio.href);
    } else {
      const blob =
        audio instanceof Uint8Array
          ? new Blob([audio as Uint8Array<ArrayBuffer>])
          : new Blob([convertBase64ToUint8Array(audio)]);
      const audioMediaType = mediaType ?? 'audio/wav';
      const fileExtension = mediaTypeToExtension(audioMediaType);
      formData.append(
        'file',
        new File([blob], 'audio', { type: audioMediaType }),
        `audio.${fileExtension}`,
      );
    }

    // Add provider-specific options
    if (groqOptions) {
      const transcriptionModelOptions: Omit<
        GroqTranscriptionAPITypes,
        'model'
      > = {
        language: groqOptions.language ?? undefined,
        prompt: groqOptions.prompt ?? undefined,
        response_format: groqOptions.responseFormat ?? undefined,
        temperature: groqOptions.temperature ?? undefined,
        timestamp_granularities:
          groqOptions.timestampGranularities ?? undefined,
      };

      for (const key in transcriptionModelOptions) {
        const value =
          transcriptionModelOptions[
            key as keyof Omit<GroqTranscriptionAPITypes, 'model'>
          ];
        if (value !== undefined) {
          if (Array.isArray(value)) {
            for (const item of value) {
              formData.append(`${key}[]`, String(item));
            }
          } else {
            formData.append(key, String(value));
          }
        }
      }
    }

    return {
      formData,
      responseFormat: groqOptions?.responseFormat,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    return this.generate(options);
  }

  async doGenerateFromUrl(
    options: Parameters<
      NonNullable<TranscriptionModelV4['doGenerateFromUrl']>
    >[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    return this.generate(options);
  }

  private async generate(options: GroqTranscriptionCallOptions) {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, responseFormat, warnings } = await this.getArgs(options);

    const successfulResponseHandler: ResponseHandler<GroqTranscriptionResponse> =
      responseFormat === 'text'
        ? groqTextTranscriptionResponseHandler
        : createJsonResponseHandler(groqTranscriptionResponseSchema);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/audio/transcriptions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(
        await resolve(this.config.headers),
        options.headers,
      ),
      formData,
      failedResponseHandler: groqFailedResponseHandler,
      successfulResponseHandler,
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.segments?.map(segment => ({
          text: segment.text,
          startSecond: segment.start,
          endSecond: segment.end,
        })) ??
        response.words?.map(word => ({
          text: word.word,
          startSecond: word.start,
          endSecond: word.end,
        })) ??
        [],
      language: response.language ?? undefined,
      durationInSeconds: response.duration ?? undefined,
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

const groqTranscriptionResponseSchema = z.object({
  text: z.string(),
  x_groq: z.object({
    id: z.string(),
  }),
  // additional properties are returned when `response_format: 'verbose_json'` is
  task: z.string().nullish(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
  segments: z
    .array(
      z.object({
        id: z.number(),
        seek: z.number(),
        start: z.number(),
        end: z.number(),
        text: z.string(),
        tokens: z.array(z.number()),
        temperature: z.number(),
        avg_logprob: z.number(),
        compression_ratio: z.number(),
        no_speech_prob: z.number(),
      }),
    )
    .nullish(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
});

type GroqTranscriptionResponse = Partial<
  Omit<z.infer<typeof groqTranscriptionResponseSchema>, 'text'>
> & {
  text: string;
};

const binaryResponseHandler = createBinaryResponseHandler();
const textDecoder = new TextDecoder();

const groqTextTranscriptionResponseHandler: ResponseHandler<
  GroqTranscriptionResponse
> = async options => {
  const { value, responseHeaders } = await binaryResponseHandler(options);
  const text = textDecoder.decode(value);

  return {
    value: { text },
    rawValue: text,
    responseHeaders,
  };
};

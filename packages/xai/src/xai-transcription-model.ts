import type { SharedV4Warning, TranscriptionModelV4 } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type FetchFunction,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { xaiFailedResponseHandler } from './xai-error';
import { xaiTranscriptionModelOptionsSchema } from './xai-transcription-model-options';

interface XaiTranscriptionModelConfig {
  provider: string;
  baseURL: string | undefined;
  headers?: () => Record<string, string | undefined>;
  fetch?: FetchFunction;
  _internal?: {
    currentDate?: () => Date;
  };
}

export class XaiTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: XaiTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: '';
    config: XaiTranscriptionModelConfig;
  }) {
    return new XaiTranscriptionModel(options.modelId, options.config);
  }

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: '',
    private readonly config: XaiTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];
    const xaiOptions = await parseProviderOptions({
      provider: 'xai',
      providerOptions,
      schema: xaiTranscriptionModelOptionsSchema,
    });

    const formData = new FormData();
    const transcriptionOptions = {
      audio_format: xaiOptions?.audioFormat,
      sample_rate: xaiOptions?.sampleRate,
      language: xaiOptions?.language,
      format: xaiOptions?.format,
      multichannel: xaiOptions?.multichannel,
      channels: xaiOptions?.channels,
      diarize: xaiOptions?.diarize,
      filler_words: xaiOptions?.fillerWords,
    };

    for (const [key, value] of Object.entries(transcriptionOptions)) {
      if (value != null) {
        formData.append(key, String(value));
      }
    }

    if (xaiOptions?.keyterm != null) {
      const keyterms = Array.isArray(xaiOptions.keyterm)
        ? xaiOptions.keyterm
        : [xaiOptions.keyterm];

      for (const keyterm of keyterms) {
        formData.append('keyterm', keyterm);
      }
    }

    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);
    const fileExtension = mediaTypeToExtension(mediaType);

    // xAI requires `file` to be the final multipart field.
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );

    return { formData, warnings };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = await this.getArgs(options);

    const {
      value: response,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: `${this.config.baseURL ?? 'https://api.x.ai/v1'}/stt`,
      headers: combineHeaders(this.config.headers?.(), options.headers),
      formData,
      failedResponseHandler: xaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        xaiTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.words?.map(word => ({
          text: word.text,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
      language: response.language || undefined,
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

const xaiTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
  words: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
});

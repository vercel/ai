import type { TranscriptionModelV4, SharedV4Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  parseProviderOptions,
  postFormDataToApi,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { CartesiaConfig } from './cartesia-config';
import { cartesiaFailedResponseHandler } from './cartesia-error';
import { cartesiaTranscriptionModelOptionsSchema } from './cartesia-transcription-model-options';
import type { CartesiaTranscriptionModelId } from './cartesia-transcription-options';

interface CartesiaTranscriptionModelConfig extends CartesiaConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class CartesiaTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: CartesiaTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: CartesiaTranscriptionModelId;
    config: CartesiaTranscriptionModelConfig;
  }) {
    return new CartesiaTranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: CartesiaTranscriptionModelId,
    private readonly config: CartesiaTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    // Parse provider options
    const cartesiaOptions = await parseProviderOptions({
      provider: 'cartesia',
      providerOptions,
      schema: cartesiaTranscriptionModelOptionsSchema,
    });

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    const fileExtension = mediaTypeToExtension(mediaType);
    formData.append('model', this.modelId);
    formData.append(
      'file',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${fileExtension}`,
    );

    // Add provider-specific options
    if (cartesiaOptions) {
      if (cartesiaOptions.language != null) {
        formData.set('language', cartesiaOptions.language);
      }
      if (cartesiaOptions.timestampGranularities != null) {
        for (const granularity of cartesiaOptions.timestampGranularities) {
          formData.append('timestamp_granularities[]', granularity);
        }
      }
    }

    return {
      formData,
      warnings,
    };
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
      url: this.config.url({
        path: '/stt',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      formData,
      failedResponseHandler: cartesiaFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        cartesiaTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      text: response.text,
      segments:
        response.words?.map(word => ({
          text: word.word,
          startSecond: word.start,
          endSecond: word.end,
        })) ?? [],
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

const cartesiaTranscriptionResponseSchema = z.object({
  text: z.string(),
  language: z.string().nullish(),
  duration: z.number().nullish(),
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

import type {
  TranscriptionModelV4,
  SharedV4Warning,
  SharedV4ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createJsonResponseHandler,
  mediaTypeToExtension,
  postFormDataToApi,
  serializeModelOptions,
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';

export interface AzureSpeechTranscriptionModelSettings {
  resourceName?: string;
  baseURL?: string;
  apiKey?: string;
  apiVersion?: string;
  headers?: Record<string, string>;
  fetch?: typeof globalThis.fetch;
}

export class AzureSpeechTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  static [WORKFLOW_SERIALIZE](model: AzureSpeechTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: string;
    config: AzureSpeechTranscriptionModelSettings;
  }) {
    return new AzureSpeechTranscriptionModel(options.modelId, options.config);
  }

  get provider(): string {
    return 'azure.speech';
  }

  constructor(
    readonly modelId: string,
    private readonly config: AzureSpeechTranscriptionModelSettings,
  ) {}

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const currentDate = new Date();
    const warnings: SharedV4Warning[] = [];

    const formData = new FormData();
    const blob =
      options.audio instanceof Uint8Array
        ? new Blob([options.audio])
        : new Blob([convertBase64ToUint8Array(options.audio)]);

    const fileExtension = mediaTypeToExtension(options.mediaType);
    formData.append(
      'audio',
      new File([blob], `audio.${fileExtension}`, { type: options.mediaType }),
    );

    const definition: Record<string, unknown> = {};
    const azureOptions = options.providerOptions?.azure as
      | Record<string, unknown>
      | undefined;

    if (azureOptions?.locales != null) {
      definition.locales = azureOptions.locales;
    }
    if (azureOptions?.diarization != null) {
      definition.diarization = azureOptions.diarization;
    }
    if (azureOptions?.transcribeOptions != null) {
      definition.transcribeOptions = azureOptions.transcribeOptions;
    }
    if (azureOptions?.phraseList != null) {
      definition.phraseList = azureOptions.phraseList;
    }

    formData.append('definition', JSON.stringify(definition));

    const apiVersion = this.config.apiVersion ?? '2025-10-15';
    const baseUrl =
      this.config.baseURL ??
      `https://${this.config.resourceName}.cognitiveservices.azure.com`;
    const url = `${baseUrl.replace(/\/+$/, '')}/speechtotext/transcriptions:transcribe?api-version=${apiVersion}`;

    const headers: Record<string, string> = {
      ...this.config.headers,
      ...(this.config.apiKey
        ? { 'Ocp-Apim-Subscription-Key': this.config.apiKey }
        : {}),
    };

    const {
      value: response,
      rawValue: rawResponse,
      responseHeaders,
    } = await postFormDataToApi({
      url,
      headers: combineHeaders(headers, options.headers),
      formData,
      failedResponseHandler: async ({ response }) => {
        const text = await response.text();
        return new Error(
          `Azure Speech MAI-Transcribe error (${response.status}): ${text}`,
        );
      },
      successfulResponseHandler: createJsonResponseHandler(
        azureSpeechTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const text = response.combinedPhrases?.map(p => p.text).join(' ') ?? '';
    const segments =
      response.phrases?.map(phrase => ({
        text: phrase.text,
        startSecond: phrase.offsetMilliseconds / 1000,
        endSecond:
          (phrase.offsetMilliseconds + phrase.durationMilliseconds) / 1000,
        speaker: phrase.speaker != null ? String(phrase.speaker) : undefined,
      })) ?? [];

    const durationInSeconds =
      response.durationMilliseconds != null
        ? response.durationMilliseconds / 1000
        : undefined;

    return {
      text,
      segments,
      language: response.locales?.[0],
      durationInSeconds,
      warnings,
      providerMetadata: {
        azure: {
          phrases: response.phrases,
          combinedPhrases: response.combinedPhrases,
        } as SharedV4ProviderMetadata,
      },
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}

const azureSpeechTranscriptionResponseSchema = z.object({
  combinedPhrases: z.array(z.object({ text: z.string() })).optional(),
  phrases: z
    .array(
      z.object({
        text: z.string(),
        offsetMilliseconds: z.number(),
        durationMilliseconds: z.number(),
        speaker: z.union([z.string(), z.number()]).optional(),
        words: z
          .array(
            z.object({
              text: z.string(),
              offsetMilliseconds: z.number(),
              durationMilliseconds: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .optional(),
  durationMilliseconds: z.number().optional(),
  locales: z.array(z.string()).optional(),
});

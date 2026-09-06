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
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { FishAudioConfig } from './fish-audio-config';
import { fishAudioFailedResponseHandler } from './fish-audio-error';
import { fishAudioTranscriptionModelOptionsSchema } from './fish-audio-transcription-model-options';
import type { FishAudioTranscriptionModelId } from './fish-audio-transcription-options';

interface FishAudioTranscriptionModelConfig extends FishAudioConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FishAudioTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  get provider(): string {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: FishAudioTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: model.config,
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: FishAudioTranscriptionModelId;
    config: FishAudioTranscriptionModelConfig;
  }) {
    return new FishAudioTranscriptionModel(options.modelId, options.config);
  }

  constructor(
    readonly modelId: FishAudioTranscriptionModelId,
    private readonly config: FishAudioTranscriptionModelConfig,
  ) {}

  private async getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]) {
    const warnings: SharedV4Warning[] = [];

    const fishAudioOptions = await parseProviderOptions({
      provider: 'fishAudio',
      providerOptions,
      schema: fishAudioTranscriptionModelOptionsSchema,
    });

    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append(
      'audio',
      new File([blob], 'audio', { type: mediaType }),
      `audio.${mediaTypeToExtension(mediaType)}`,
    );

    if (fishAudioOptions?.language != null) {
      formData.append('language', fishAudioOptions.language);
    }

    // Fish Audio defaults `ignore_timestamps` to true, which leaves the
    // transcription result without segments. Request timestamps by default and
    // let callers opt back out.
    formData.append(
      'ignore_timestamps',
      String(fishAudioOptions?.ignoreTimestamps ?? false),
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
      url: this.config.url({ path: '/v1/asr', modelId: this.modelId }),
      headers: combineHeaders(this.config.headers?.(), options.headers),
      formData,
      failedResponseHandler: fishAudioFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        fishAudioTranscriptionResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const segments =
      response.segments?.map(segment => ({
        text: segment.text,
        startSecond: segment.start,
        endSecond: segment.end,
      })) ?? [];

    return {
      text: response.text,
      segments,
      // `language_code` is absent from the documented response schema but is
      // returned in practice, and reflects the detected language rather than
      // the requested one.
      language: response.language_code ?? undefined,
      durationInSeconds: response.duration ?? undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
      ...(response.language != null && {
        providerMetadata: {
          fishAudio: {
            // Human-readable display name, e.g. `English`. Its exact form is
            // not guaranteed, so `language` above (the ISO-639-1 code) is the
            // value to branch on.
            language: response.language,
          },
        },
      }),
    };
  }
}

const fishAudioTranscriptionResponseSchema = z.object({
  text: z.string(),
  // `language` and `language_code` are undocumented but returned in practice.
  // Human-readable name, e.g. `English`.
  language: z.string().nullish(),
  // ISO-639-1 code, e.g. `en`.
  language_code: z.string().nullish(),
  duration: z.number().nullish(),
  segments: z
    .array(
      z.object({
        text: z.string(),
        start: z.number(),
        end: z.number(),
      }),
    )
    .nullish(),
});

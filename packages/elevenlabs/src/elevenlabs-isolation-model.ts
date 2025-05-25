import {
  IsolationModelV1,
  IsolationModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  createBinaryResponseHandler,
  parseProviderOptions,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { ElevenLabsConfig } from './elevenlabs-config';
import { elevenlabsFailedResponseHandler } from './elevenlabs-error';
import { ElevenLabsIsolationAPITypes } from './elevenlabs-api-types';

// https://elevenlabs.io/docs/api-reference/audio-isolation/audio-isolation
const elevenLabsProviderOptionsSchema = z.object({
  file_format: z.enum(['pcm_s16le_16', 'other']).nullish().default('other'),
});

export type ElevenLabsIsolationCallOptions = z.infer<
  typeof elevenLabsProviderOptionsSchema
>;

interface ElevenLabsIsolationModelConfig extends ElevenLabsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ElevenLabsIsolationModel implements IsolationModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: '',
    private readonly config: ElevenLabsIsolationModelConfig,
  ) {}

  private getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<IsolationModelV1['doGenerate']>[0]) {
    const warnings: IsolationModelV1CallWarning[] = [];

    // Parse provider options
    const elevenlabsOptions = parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: elevenLabsProviderOptionsSchema,
    });

    // Create form data with base fields
    const formData = new FormData();
    const blob =
      audio instanceof Uint8Array
        ? new Blob([audio])
        : new Blob([convertBase64ToUint8Array(audio)]);

    formData.append('model_id', this.modelId);
    formData.append('audio', new File([blob], 'audio', { type: mediaType }));

    // Add provider-specific options
    if (elevenlabsOptions) {
      const isolationModelOptions: ElevenLabsIsolationAPITypes = {
        file_format: elevenlabsOptions.file_format ?? undefined,
      };

      for (const key in isolationModelOptions) {
        const value =
          isolationModelOptions[key as keyof ElevenLabsIsolationAPITypes];
        if (value !== undefined) {
          formData.append(key, String(value));
        }
      }
    }

    return {
      formData,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<IsolationModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<IsolationModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/v1/audio-isolation',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      formData,
      failedResponseHandler: elevenlabsFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    return {
      audio,
      warnings,
      request: {
        body: formData,
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

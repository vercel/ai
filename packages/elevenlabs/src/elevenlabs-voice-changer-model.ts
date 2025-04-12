import {
  VoiceChangerModelV1,
  VoiceChangerModelV1CallWarning,
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
import { ElevenLabsVoiceChangerModelId } from './elevenlabs-voice-changer-settings';
import { ElevenLabsVoiceChangerAPITypes } from './elevenlabs-api-types';

// https://elevenlabs.io/docs/api-reference/speech-to-speech/convert
const elevenLabsProviderOptionsSchema = z.object({
  enableLogging: z.boolean().nullish().default(true),
  outputFormat: z
    .enum([
      'mp3_22050_32',
      'mp3_44100_32',
      'mp3_44100_64',
      'mp3_44100_96',
      'mp3_44100_128',
      'mp3_44100_192',
      'pcm_8000',
      'pcm_16000',
      'pcm_22050',
      'pcm_24000',
      'pcm_44100',
      'ulaw_8000',
      'alaw_8000',
      'opus_48000_32',
      'opus_48000_64',
      'opus_48000_96',
      'opus_48000_128',
    ])
    .nullish()
    .default('mp3_44100_128'),
});

export type ElevenLabsVoiceChangerCallOptions = z.infer<
  typeof elevenLabsProviderOptionsSchema
>;

interface ElevenLabsVoiceChangerModelConfig extends ElevenLabsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ElevenLabsVoiceChangerModel implements VoiceChangerModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ElevenLabsVoiceChangerModelId,
    private readonly config: ElevenLabsVoiceChangerModelConfig,
  ) {}

  private getArgs({
    audio,
    mediaType,
    providerOptions,
  }: Parameters<VoiceChangerModelV1['doGenerate']>[0]) {
    const warnings: VoiceChangerModelV1CallWarning[] = [];

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
    formData.append('file', new File([blob], 'audio', { type: mediaType }));
    formData.append('diarize', 'true');

    // Add provider-specific options
    if (elevenlabsOptions) {
      const voiceChangerModelOptions: ElevenLabsVoiceChangerAPITypes = {
        enable_logging: elevenlabsOptions.enableLogging ?? undefined,
        output_format: elevenlabsOptions.outputFormat ?? undefined,
      };

      for (const key in voiceChangerModelOptions) {
        const value =
          voiceChangerModelOptions[key as keyof ElevenLabsVoiceChangerAPITypes];
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
    options: Parameters<VoiceChangerModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<VoiceChangerModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { formData, warnings } = this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postFormDataToApi({
      url: this.config.url({
        path: '/v1/speech-to-speech',
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
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}

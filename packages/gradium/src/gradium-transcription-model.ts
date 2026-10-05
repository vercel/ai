import {
  UnsupportedFunctionalityError,
  type TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  convertBase64ToUint8Array,
  parseProviderOptions,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import type { STTSetup } from '@gradium/sdk';
import { callGradium } from './gradium-client';
import type { GradiumConfig } from './gradium-config';
import {
  gradiumTranscriptionOptionsSchema,
  type GradiumTranscriptionModelId,
} from './gradium-options';

export class GradiumTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4';

  constructor(
    readonly modelId: GradiumTranscriptionModelId,
    private readonly config: GradiumConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: GradiumTranscriptionModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: { ...model.config, headers: undefined },
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GradiumTranscriptionModelId;
    config: GradiumConfig;
  }) {
    return new GradiumTranscriptionModel(options.modelId, options.config);
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>> {
    const timestamp = new Date();
    const settings = await parseProviderOptions({
      provider: 'gradium',
      providerOptions: options.providerOptions,
      schema: gradiumTranscriptionOptionsSchema,
    });
    const mediaType = options.mediaType.split(';')[0].trim().toLowerCase();
    const inputFormat =
      settings?.inputFormat ??
      (
        {
          'audio/wav': 'wav',
          'audio/x-wav': 'wav',
          'audio/wave': 'wav',
          'audio/vnd.wave': 'wav',
          'audio/opus': 'opus',
          'audio/ogg': 'opus',
          'audio/pcm': 'pcm',
        } as Record<string, string>
      )[mediaType];
    if (!inputFormat) {
      throw new UnsupportedFunctionalityError({
        functionality: `Gradium transcription media type: ${options.mediaType}`,
      });
    }
    const setup: STTSetup = {
      model_name: this.modelId,
      input_format: inputFormat,
      json_config: settings?.jsonConfig,
      client_req_id: settings?.clientRequestId,
    };
    const audio =
      typeof options.audio === 'string'
        ? convertBase64ToUint8Array(options.audio)
        : options.audio;
    const result = await callGradium(
      this.config,
      this.config.sttRoute ?? 'speech/asr',
      setup,
      options.abortSignal,
      client => client.stt(setup, audio),
    );
    return {
      text: result.text,
      segments: result.textWithTimestamps.map(segment => ({
        text: segment.text,
        startSecond: segment.startS,
        endSecond: segment.stopS,
      })),
      language: undefined,
      durationInSeconds: undefined,
      warnings: Object.entries(options.headers ?? {}).some(
        ([name, value]) =>
          name.toLowerCase() !== 'user-agent' && value !== undefined,
      )
        ? [{ type: 'unsupported', feature: 'headers' }]
        : [],
      response: { timestamp, modelId: this.modelId },
      providerMetadata: {
        gradium: {
          ...(result.requestId !== undefined && {
            requestId: result.requestId,
          }),
        },
      },
    };
  }
}

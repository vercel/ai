import {
  UnsupportedFunctionalityError,
  type SpeechModelV4,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  parseProviderOptions,
  serializeModelOptions,
  WORKFLOW_SERIALIZE,
  WORKFLOW_DESERIALIZE,
} from '@ai-sdk/provider-utils';
import type { TTSSetup } from '@gradium/sdk';
import { callGradium } from './gradium-client';
import type { GradiumConfig } from './gradium-config';
import {
  gradiumOutputFormats,
  gradiumSpeechOptionsSchema,
  type GradiumSpeechModelId,
} from './gradium-options';

export class GradiumSpeechModel implements SpeechModelV4 {
  readonly specificationVersion = 'v4';

  constructor(
    readonly modelId: GradiumSpeechModelId,
    private readonly config: GradiumConfig,
  ) {}

  get provider() {
    return this.config.provider;
  }

  static [WORKFLOW_SERIALIZE](model: GradiumSpeechModel) {
    return serializeModelOptions({
      modelId: model.modelId,
      config: { ...model.config, headers: undefined },
    });
  }

  static [WORKFLOW_DESERIALIZE](options: {
    modelId: GradiumSpeechModelId;
    config: GradiumConfig;
  }) {
    return new GradiumSpeechModel(options.modelId, options.config);
  }

  async doGenerate(
    options: Parameters<SpeechModelV4['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV4['doGenerate']>>> {
    const timestamp = new Date();
    const settings = await parseProviderOptions({
      provider: 'gradium',
      providerOptions: options.providerOptions,
      schema: gradiumSpeechOptionsSchema,
    });
    const outputFormat = options.outputFormat ?? 'wav';
    if (!(gradiumOutputFormats as readonly string[]).includes(outputFormat)) {
      throw new UnsupportedFunctionalityError({
        functionality: `Gradium speech output format: ${outputFormat}`,
      });
    }
    const warnings: SharedV4Warning[] = [];
    for (const feature of ['speed', 'language', 'instructions'] as const) {
      if (options[feature] !== undefined)
        warnings.push({ type: 'unsupported', feature });
    }
    if (
      Object.entries(options.headers ?? {}).some(
        ([name, value]) =>
          name.toLowerCase() !== 'user-agent' && value !== undefined,
      )
    ) {
      warnings.push({ type: 'unsupported', feature: 'headers' });
    }
    const setup: TTSSetup = {
      model_name: this.modelId,
      voice_id: options.voice ?? settings?.voiceId,
      voice: settings?.voice,
      output_format: outputFormat,
      pronunciation_id: settings?.pronunciationId,
      json_config: settings?.jsonConfig,
      client_req_id: settings?.clientRequestId,
    };
    const result = await callGradium(
      this.config,
      this.config.ttsRoute ?? 'speech/tts',
      setup,
      options.abortSignal,
      client => client.tts(setup, options.text),
    );
    return {
      audio: result.rawData,
      warnings,
      response: { timestamp, modelId: this.modelId },
      providerMetadata: {
        gradium: {
          ...(result.requestId !== undefined && {
            requestId: result.requestId,
          }),
          ...(result.sampleRate !== undefined && {
            sampleRate: result.sampleRate,
          }),
          outputFormat,
          textWithTimestamps: result.textWithTimestamps.map(segment => ({
            text: segment.text,
            startSecond: segment.startS,
            endSecond: segment.stopS,
          })),
        },
      },
    };
  }
}

import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { CambaiConfig } from './cambai-config';
import { cambaiFailedResponseHandler } from './cambai-error';
import { CambaiSpeechAPITypes } from './cambai-speech-api-types';
import { CambaiSpeechModelId } from './cambai-speech-options';

const cambaiSpeechModelOptionsSchema = z.object({
  voiceSettings: z
    .object({
      enhanceReferenceAudioQuality: z.boolean().optional(),
      maintainSourceAccent: z.boolean().optional(),
      applyRefLoudnessNorm: z.boolean().optional(),
    })
    .optional(),
  inferenceOptions: z
    .object({
      stability: z.number().min(0).max(1).optional(),
      temperature: z.number().min(0.01).max(4.0).optional(),
      inferenceSteps: z.number().min(1).max(1000).optional(),
      speakerSimilarity: z.number().min(0).max(1).optional(),
      localizeSpeakerWeight: z.number().optional(),
      acousticQualityBoost: z.boolean().optional(),
    })
    .optional(),
  outputConfiguration: z
    .object({
      duration: z.number().optional(),
      applyEnhancement: z.boolean().optional(),
    })
    .optional(),
  enhanceNamedEntitiesPronunciation: z.boolean().optional(),
});

export type CambaiSpeechModelOptions = z.infer<
  typeof cambaiSpeechModelOptionsSchema
>;

interface CambaiSpeechModelConfig extends CambaiConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class CambaiSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: CambaiSpeechModelId,
    private readonly config: CambaiSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = '147320',
    outputFormat,
    instructions,
    language,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    const cambaiOptions = await parseProviderOptions({
      provider: 'cambai',
      providerOptions,
      schema: cambaiSpeechModelOptionsSchema,
    });

    const voiceId = parseInt(voice, 10);
    if (isNaN(voiceId)) {
      throw new Error(
        `Invalid voice ID "${voice}". Camb.ai requires numeric voice IDs (e.g., "147320").`,
      );
    }

    const requestBody: CambaiSpeechAPITypes = {
      text,
      language: language ?? 'en-us',
      voice_id: voiceId,
      speech_model: this.modelId,
    };

    if (speed != null) {
      warnings.push({
        type: 'unsupported',
        feature: 'speed',
        details:
          'Camb.ai speech models do not support the speed parameter. Use inferenceOptions via providerOptions instead.',
      });
    }

    if (instructions) {
      if (this.modelId === 'mars-instruct') {
        requestBody.user_instructions = instructions;
      } else {
        warnings.push({
          type: 'unsupported',
          feature: 'instructions',
          details: `Instructions are only supported for the mars-instruct model. Current model: ${this.modelId}. Instructions parameter was ignored.`,
        });
      }
    }

    if (cambaiOptions) {
      if (cambaiOptions.enhanceNamedEntitiesPronunciation != null) {
        requestBody.enhance_named_entities_pronunciation =
          cambaiOptions.enhanceNamedEntitiesPronunciation;
      }

      if (cambaiOptions.voiceSettings) {
        requestBody.voice_settings = {};
        if (cambaiOptions.voiceSettings.enhanceReferenceAudioQuality != null) {
          requestBody.voice_settings.enhance_reference_audio_quality =
            cambaiOptions.voiceSettings.enhanceReferenceAudioQuality;
        }
        if (cambaiOptions.voiceSettings.maintainSourceAccent != null) {
          requestBody.voice_settings.maintain_source_accent =
            cambaiOptions.voiceSettings.maintainSourceAccent;
        }
        if (cambaiOptions.voiceSettings.applyRefLoudnessNorm != null) {
          requestBody.voice_settings.apply_ref_loudness_norm =
            cambaiOptions.voiceSettings.applyRefLoudnessNorm;
        }
      }

      if (cambaiOptions.inferenceOptions) {
        requestBody.inference_options = {};
        if (cambaiOptions.inferenceOptions.stability != null) {
          requestBody.inference_options.stability =
            cambaiOptions.inferenceOptions.stability;
        }
        if (cambaiOptions.inferenceOptions.temperature != null) {
          requestBody.inference_options.temperature =
            cambaiOptions.inferenceOptions.temperature;
        }
        if (cambaiOptions.inferenceOptions.inferenceSteps != null) {
          requestBody.inference_options.inference_steps =
            cambaiOptions.inferenceOptions.inferenceSteps;
        }
        if (cambaiOptions.inferenceOptions.speakerSimilarity != null) {
          requestBody.inference_options.speaker_similarity =
            cambaiOptions.inferenceOptions.speakerSimilarity;
        }
        if (cambaiOptions.inferenceOptions.localizeSpeakerWeight != null) {
          requestBody.inference_options.localize_speaker_weight =
            cambaiOptions.inferenceOptions.localizeSpeakerWeight;
        }
        if (cambaiOptions.inferenceOptions.acousticQualityBoost != null) {
          requestBody.inference_options.acoustic_quality_boost =
            cambaiOptions.inferenceOptions.acousticQualityBoost;
        }
      }

      if (cambaiOptions.outputConfiguration) {
        requestBody.output_configuration = {
          ...(requestBody.output_configuration ?? {}),
        };
        if (cambaiOptions.outputConfiguration.duration != null) {
          requestBody.output_configuration.duration =
            cambaiOptions.outputConfiguration.duration;
        }
        if (cambaiOptions.outputConfiguration.applyEnhancement != null) {
          requestBody.output_configuration.apply_enhancement =
            cambaiOptions.outputConfiguration.applyEnhancement;
        }
      }
    }

    if (outputFormat) {
      requestBody.output_configuration = {
        ...(requestBody.output_configuration ?? {}),
        format: outputFormat,
      };
    }

    return { requestBody, warnings };
  }

  async doGenerate(
    options: Parameters<SpeechModelV3['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV3['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/tts-stream',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: cambaiFailedResponseHandler,
      successfulResponseHandler: createBinaryResponseHandler(),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

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
        body: rawResponse,
      },
    };
  }
}

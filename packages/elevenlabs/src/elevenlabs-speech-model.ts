import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { ElevenLabsConfig } from './elevenlabs-config';
import { elevenlabsFailedResponseHandler } from './elevenlabs-error';
import { ElevenLabsSpeechAPITypes } from './elevenlabs-speech-api-types';
import { 
  ElevenLabsSpeechModelId, 
  ElevenLabsSpeechVoiceId 
} from './elevenlabs-speech-options';

const ElevenLabsProviderOptionsSchema = z.object({
  voice_settings: z.object({
    stability: z.number().min(0).max(1).nullish(),
    similarity_boost: z.number().min(0).max(1).nullish(),
    style: z.number().min(0).max(1).nullish(),
    use_speaker_boost: z.boolean().nullish(),
  }).nullish(),
  seed: z.number().nullish(),
  previous_text: z.string().nullish(),
  next_text: z.string().nullish(),
  enable_logging: z.boolean().nullish(),
});

export type ElevenLabsSpeechCallOptions = z.infer<
  typeof ElevenLabsProviderOptionsSchema
>;

interface ElevenLabsSpeechModelConfig extends ElevenLabsConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class ElevenLabsSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: ElevenLabsSpeechModelId,
    private readonly config: ElevenLabsSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice,
    outputFormat = 'mp3_44100_128',
    speed,
    instructions,
    language,
    providerOptions,
  }: Parameters<SpeechModelV2['doGenerate']>[0]) {
    const warnings: SpeechModelV2CallWarning[] = [];

    // Parse provider options
    const elevenLabsOptions = await parseProviderOptions({
      provider: 'elevenlabs',
      providerOptions,
      schema: ElevenLabsProviderOptionsSchema,
    });

    // Voice is required for ElevenLabs (it's the voice_id in the URL)
    if (!voice) {
      throw new Error('Voice ID is required for ElevenLabs speech generation');
    }

    // Create request body
    const requestBody: ElevenLabsSpeechAPITypes = {
      text,
      model_id: this.modelId,
    };

    // Map outputFormat to ElevenLabs format
    if (outputFormat) {
      const formatMap: Record<string, ElevenLabsSpeechAPITypes['output_format']> = {
        'mp3': 'mp3_44100_128',
        'mp3_32': 'mp3_44100_32',
        'mp3_64': 'mp3_44100_64',
        'mp3_96': 'mp3_44100_96',
        'mp3_128': 'mp3_44100_128',
        'mp3_192': 'mp3_44100_192',
        'pcm': 'pcm_44100',
        'pcm_16000': 'pcm_16000',
        'pcm_22050': 'pcm_22050',
        'pcm_24000': 'pcm_24000',
        'pcm_44100': 'pcm_44100',
        'ulaw': 'ulaw_8000',
      };

      const mappedFormat = formatMap[outputFormat] || 
        (outputFormat as ElevenLabsSpeechAPITypes['output_format']);
      
      if (mappedFormat) {
        requestBody.output_format = mappedFormat;
      } else {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'outputFormat',
          details: `Unsupported output format: ${outputFormat}. Using mp3_44100_128 instead.`,
        });
      }
    }

    // Add language code if provided
    if (language) {
      requestBody.language_code = language;
    }

    // Add provider-specific options
    if (elevenLabsOptions) {
      if (elevenLabsOptions.voice_settings) {
        requestBody.voice_settings = elevenLabsOptions.voice_settings;
      }
      if (elevenLabsOptions.seed !== undefined) {
        requestBody.seed = elevenLabsOptions.seed;
      }
      if (elevenLabsOptions.previous_text) {
        requestBody.previous_text = elevenLabsOptions.previous_text;
      }
      if (elevenLabsOptions.next_text) {
        requestBody.next_text = elevenLabsOptions.next_text;
      }
      if (elevenLabsOptions.enable_logging !== undefined) {
        requestBody.enable_logging = elevenLabsOptions.enable_logging;
      }
    }

    // Warnings for unsupported parameters
    if (speed !== undefined) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'speed',
        details: `ElevenLabs speech models do not support speed adjustment. Speed parameter "${speed}" was ignored.`,
      });
    }

    if (instructions) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'instructions',
        details: `ElevenLabs speech models do not support instructions. Instructions parameter was ignored.`,
      });
    }

    return {
      requestBody,
      warnings,
      voiceId: voice as ElevenLabsSpeechVoiceId,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings, voiceId } = await this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: `/v1/text-to-speech/${voiceId}`,
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: elevenlabsFailedResponseHandler,
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
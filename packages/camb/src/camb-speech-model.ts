import { SpeechModelV3, SharedV3Warning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { CambConfig } from './camb-config';
import { cambFailedResponseHandler } from './camb-error';
import { CambSpeechAPITypes } from './camb-speech-api-types';
import { CambSpeechModelId } from './camb-speech-options';

const cambSpeechModelOptionsSchema = z.object({
  language: z.string().optional(),
  age: z.number().optional(),
  gender: z.enum(['male', 'female']).optional(),
  accent: z.string().optional(),
});

export type CambSpeechModelOptions = z.infer<
  typeof cambSpeechModelOptionsSchema
>;

interface CambSpeechModelConfig extends CambConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class CambSpeechModel implements SpeechModelV3 {
  readonly specificationVersion = 'v3';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: CambSpeechModelId,
    private readonly config: CambSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = '1',
    instructions,
    speed,
    providerOptions,
  }: Parameters<SpeechModelV3['doGenerate']>[0]) {
    const warnings: SharedV3Warning[] = [];

    const cambOptions = await parseProviderOptions({
      provider: 'camb',
      providerOptions,
      schema: cambSpeechModelOptionsSchema,
    });

    const voiceId = parseInt(voice, 10);

    const requestBody: CambSpeechAPITypes = {
      text,
      voice_id: isNaN(voiceId) ? 1 : voiceId,
      speech_model: this.modelId,
      language: cambOptions?.language ?? 'en-us',
    };

    if (speed != null) {
      requestBody.speed = speed;
    }

    if (cambOptions) {
      if (cambOptions.age != null) {
        requestBody.age = cambOptions.age;
      }
      if (cambOptions.gender) {
        requestBody.gender = cambOptions.gender;
      }
      if (cambOptions.accent) {
        requestBody.accent = cambOptions.accent;
      }
    }

    if (instructions) {
      warnings.push({
        type: 'unsupported',
        feature: 'instructions',
        details:
          'CAMB AI speech models do not support instructions. Instructions parameter was ignored.',
      });
    }

    return {
      requestBody,
      warnings,
    };
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
      failedResponseHandler: cambFailedResponseHandler,
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

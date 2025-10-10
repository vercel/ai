import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  createJsonResponseHandler,
  createStatusCodeErrorResponseHandler,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { FalConfig } from './fal-config';
import { falFailedResponseHandler } from './fal-error';
import { FAL_EMOTIONS, FAL_LANGUAGE_BOOSTS } from './fal-api-types';
import { FalSpeechModelId } from './fal-speech-settings';

const falSpeechProviderOptionsSchema = z.looseObject({
  voice_setting: z
    .object({
      speed: z.number().nullish(),
      vol: z.number().nullish(),
      voice_id: z.string().nullish(),
      pitch: z.number().nullish(),
      english_normalization: z.boolean().nullish(),
      emotion: z.enum(FAL_EMOTIONS).nullish(),
    })
    .partial()
    .nullish(),
  audio_setting: z.record(z.string(), z.unknown()).nullish(),
  language_boost: z.enum(FAL_LANGUAGE_BOOSTS).nullish(),
  pronunciation_dict: z.record(z.string(), z.string()).nullish(),
});

export type FalSpeechCallOptions = z.infer<
  typeof falSpeechProviderOptionsSchema
>;

interface FalSpeechModelConfig extends FalConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FalSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: FalSpeechModelId,
    private readonly config: FalSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice,
    outputFormat,
    speed,
    language,
    providerOptions,
  }: Parameters<SpeechModelV2['doGenerate']>[0]) {
    const warnings: SpeechModelV2CallWarning[] = [];

    const falOptions = await parseProviderOptions({
      provider: 'fal',
      providerOptions,
      schema: falSpeechProviderOptionsSchema,
    });

    const requestBody = {
      text,
      output_format: outputFormat === 'hex' ? 'hex' : 'url',
      voice,
      speed,
      ...falOptions,
    };

    // Language is not directly supported; warn and ignore
    if (language) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'language',
        details:
          "fal speech models don't support 'language' directly; consider providerOptions.fal.language_boost",
      });
    }

    // warn on invalid values (and on hex until we support hex response handling)
    if (outputFormat && outputFormat !== 'url' && outputFormat !== 'hex') {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'outputFormat',
        details: `Unsupported or unhandled outputFormat: ${outputFormat}. Using 'url' instead.`,
      });
    }

    return { requestBody, warnings } as const;
  }

  async doGenerate(
    options: Parameters<SpeechModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: json,
      responseHeaders,
      rawValue,
    } = await postJsonToApi({
      url: this.config.url({
        path: `https://fal.run/${this.modelId}`,
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        falSpeechResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    const audioUrl = json.audio.url;
    const { value: audio } = await getFromApi({
      url: audioUrl,
      failedResponseHandler: createStatusCodeErrorResponseHandler(),
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
        body: rawValue,
      },
    };
  }
}

const falSpeechResponseSchema = z.object({
  audio: z.object({ url: z.string() }),
  duration_ms: z.number().optional(),
  request_id: z.string().optional(),
});

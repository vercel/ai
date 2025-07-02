import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { LMNTConfig } from './lmnt-config';
import { lmntFailedResponseHandler } from './lmnt-error';
import { LMNTSpeechModelId } from './lmnt-speech-options';
import { LMNTSpeechAPITypes } from './lmnt-api-types';

// https://docs.lmnt.com/api-reference/speech/synthesize-speech-bytes
const lmntSpeechCallOptionsSchema = z.object({
  /**
   * The model to use for speech synthesis e.g. 'aurora' or 'blizzard'.
   * @default 'aurora'
   */
  model: z
    .union([z.enum(['aurora', 'blizzard']), z.string()])
    .nullish()
    .default('aurora'),

  /**
   * The audio format of the output.
   * @default 'mp3'
   */
  format: z
    .enum(['aac', 'mp3', 'mulaw', 'raw', 'wav'])
    .nullish()
    .default('mp3'),

  /**
   * The sample rate of the output audio in Hz.
   * @default 24000
   */
  sampleRate: z
    .union([z.literal(8000), z.literal(16000), z.literal(24000)])
    .nullish()
    .default(24000),

  /**
   * The speed of the speech. Range: 0.25 to 2.
   * @default 1
   */
  speed: z.number().min(0.25).max(2).nullish().default(1),

  /**
   * A seed value for deterministic generation.
   */
  seed: z.number().int().nullish(),

  /**
   * Whether to use a conversational style.
   * @default false
   */
  conversational: z.boolean().nullish().default(false),

  /**
   * Maximum length of the output in seconds (up to 300).
   */
  length: z.number().max(300).nullish(),

  /**
   * Top-p sampling parameter. Range: 0 to 1.
   * @default 1
   */
  topP: z.number().min(0).max(1).nullish().default(1),

  /**
   * Temperature for sampling. Higher values increase randomness.
   * @default 1
   */
  temperature: z.number().min(0).nullish().default(1),
});

export type LMNTSpeechCallOptions = z.infer<typeof lmntSpeechCallOptionsSchema>;

interface LMNTSpeechModelConfig extends LMNTConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class LMNTSpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: LMNTSpeechModelId,
    private readonly config: LMNTSpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = 'ava',
    outputFormat = 'mp3',
    speed,
    language,
    providerOptions,
  }: Parameters<SpeechModelV2['doGenerate']>[0]) {
    const warnings: SpeechModelV2CallWarning[] = [];

    // Parse provider options
    const lmntOptions = await parseProviderOptions({
      provider: 'lmnt',
      providerOptions,
      schema: lmntSpeechCallOptionsSchema,
    });

    // Create request body
    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      text,
      voice,
      response_format: 'mp3',
      speed,
    };

    if (outputFormat) {
      if (['mp3', 'aac', 'mulaw', 'raw', 'wav'].includes(outputFormat)) {
        requestBody.response_format = outputFormat;
      } else {
        warnings.push({
          type: 'unsupported-setting',
          setting: 'outputFormat',
          details: `Unsupported output format: ${outputFormat}. Using mp3 instead.`,
        });
      }
    }

    // Add provider-specific options
    if (lmntOptions) {
      const speechModelOptions: Omit<LMNTSpeechAPITypes, 'voice' | 'text'> = {
        conversational: lmntOptions.conversational ?? undefined,
        length: lmntOptions.length ?? undefined,
        seed: lmntOptions.seed ?? undefined,
        speed: lmntOptions.speed ?? undefined,
        temperature: lmntOptions.temperature ?? undefined,
        top_p: lmntOptions.topP ?? undefined,
        sample_rate: lmntOptions.sampleRate ?? undefined,
      };

      for (const key in speechModelOptions) {
        const value =
          speechModelOptions[
            key as keyof Omit<LMNTSpeechAPITypes, 'voice' | 'text'>
          ];
        if (value !== undefined) {
          requestBody[key] = value;
        }
      }
    }

    if (language) {
      requestBody.language = language;
    }

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = await this.getArgs(options);

    const {
      value: audio,
      responseHeaders,
      rawValue: rawResponse,
    } = await postJsonToApi({
      url: this.config.url({
        path: '/v1/ai/speech/bytes',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: lmntFailedResponseHandler,
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

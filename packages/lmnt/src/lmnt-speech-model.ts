import { SpeechModelV1, SpeechModelV1CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { LMNTConfig } from './lmnt-config';
import { lmntFailedResponseHandler } from './lmnt-error';
import { LMNTSpeechModelId } from './lmnt-speech-settings';
import { LMNTSpeechAPITypes } from './lmnt-api-types';

// https://docs.lmnt.com/api-reference/speech/synthesize-speech-bytes
const lmntSpeechCallOptionsSchema = z.object({
  /**
   * The model to use for speech synthesis e.g. 'aurora' or 'blizzard'.
   * @default 'aurora'
   */
  model: z
    .union([z.enum(['aurora', 'blizzard']), z.string()])
    .optional()
    .default('aurora'),

  /**
   * The language of the input text.
   * @default 'auto'
   */
  language: z
    .union([z.enum(['auto', 'en']), z.string()])
    .optional()
    .default('auto'),

  /**
   * The audio format of the output.
   * @default 'mp3'
   */
  format: z
    .enum(['aac', 'mp3', 'mulaw', 'raw', 'wav'])
    .optional()
    .default('mp3'),

  /**
   * The sample rate of the output audio in Hz.
   * @default 24000
   */
  sampleRate: z.number().int().optional().default(24000),

  /**
   * The speed of the speech. Range: 0.25 to 2.
   * @default 1
   */
  speed: z.number().min(0.25).max(2).optional().default(1),

  /**
   * A seed value for deterministic generation.
   */
  seed: z.number().int().optional(),

  /**
   * Whether to use a conversational style.
   * @default false
   */
  conversational: z.boolean().optional().default(false),

  /**
   * Maximum length of the output in seconds (up to 300).
   */
  length: z.number().max(300).optional(),

  /**
   * Top-p sampling parameter. Range: 0 to 1.
   * @default 1
   */
  topP: z.number().min(0).max(1).optional().default(1),

  /**
   * Temperature for sampling. Higher values increase randomness.
   * @default 1
   */
  temperature: z.number().min(0).optional().default(1),
});

export type LMNTSpeechCallOptions = z.infer<typeof lmntSpeechCallOptionsSchema>;

interface LMNTSpeechModelConfig extends LMNTConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class LMNTSpeechModel implements SpeechModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: LMNTSpeechModelId,
    private readonly config: LMNTSpeechModelConfig,
  ) {}

  private getArgs({
    text,
    voice = 'ava',
    outputFormat = 'mp3',
    speed,
    providerOptions,
  }: Parameters<SpeechModelV1['doGenerate']>[0]) {
    const warnings: SpeechModelV1CallWarning[] = [];

    // Parse provider options
    const lmntOptions = parseProviderOptions({
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
      };

      if (
        typeof lmntOptions.sampleRate === 'number' &&
        [8000, 16000, 24000].includes(lmntOptions.sampleRate)
      ) {
        speechModelOptions.sample_rate = lmntOptions.sampleRate as
          | 8000
          | 16000
          | 24000;
      }

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

    return {
      requestBody,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<SpeechModelV1['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<SpeechModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = this.getArgs(options);

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

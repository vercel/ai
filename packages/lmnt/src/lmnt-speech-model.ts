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
  model: z.enum(['aurora', 'blizzard']).optional().default('aurora'),
  language: z
    .enum([
      'auto',
      'en',
      'es',
      'pt',
      'fr',
      'de',
      'zh',
      'ko',
      'hi',
      'ja',
      'ru',
      'it',
      'tr',
    ])
    .optional()
    .default('auto'),
  format: z
    .enum(['aac', 'mp3', 'mulaw', 'raw', 'wav'])
    .optional()
    .default('mp3'),
  sampleRate: z.number().int().optional().default(24000),
  speed: z.number().min(0.25).max(2).optional().default(1),
  seed: z.number().int().optional(),
  conversational: z.boolean().optional().default(false),
  length: z.number().max(300).optional(),
  topP: z.number().min(0).max(1).optional().default(1),
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
      if (lmntOptions) {
        for (const key in lmntOptions) {
          const value =
            lmntOptions[
              key as keyof Omit<LMNTSpeechAPITypes, 'voice' | 'text'>
            ];
          if (value !== undefined) {
            requestBody[key] = value;
          }
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

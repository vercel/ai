import { SpeechModelV2, SpeechModelV2CallWarning } from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { OpenAIConfig } from '../openai-config';
import { openaiFailedResponseHandler } from '../openai-error';
import { OpenAISpeechAPITypes } from './openai-speech-api-types';
import { OpenAISpeechModelId } from './openai-speech-options';

// https://platform.openai.com/docs/api-reference/audio/createSpeech
const OpenAIProviderOptionsSchema = z.object({
  instructions: z.string().nullish(),
  speed: z.number().min(0.25).max(4.0).default(1.0).nullish(),
});

export type OpenAISpeechCallOptions = z.infer<
  typeof OpenAIProviderOptionsSchema
>;

interface OpenAISpeechModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class OpenAISpeechModel implements SpeechModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAISpeechModelId,
    private readonly config: OpenAISpeechModelConfig,
  ) {}

  private async getArgs({
    text,
    voice = 'alloy',
    outputFormat = 'mp3',
    speed,
    instructions,
    language,
    providerOptions,
  }: Parameters<SpeechModelV2['doGenerate']>[0]) {
    const warnings: SpeechModelV2CallWarning[] = [];

    // Parse provider options
    const openAIOptions = await parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: OpenAIProviderOptionsSchema,
    });

    // Create request body
    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      input: text,
      voice,
      response_format: 'mp3',
      speed,
      instructions,
    };

    if (outputFormat) {
      if (['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(outputFormat)) {
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
    if (openAIOptions) {
      const speechModelOptions: OpenAISpeechAPITypes = {};

      for (const key in speechModelOptions) {
        const value = speechModelOptions[key as keyof OpenAISpeechAPITypes];
        if (value !== undefined) {
          requestBody[key] = value;
        }
      }
    }

    if (language) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'language',
        details: `OpenAI speech models do not support language selection. Language parameter "${language}" was ignored.`,
      });
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
        path: '/audio/speech',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: requestBody,
      failedResponseHandler: openaiFailedResponseHandler,
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

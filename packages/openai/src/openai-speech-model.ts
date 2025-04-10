import {
  SpeechModelV1,
  SpeechModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createBinaryResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import {
  OpenAISpeechModelId,
} from './openai-speech-settings';
import { OpenAISpeechAPITypes } from './openai-api-types';

// https://platform.openai.com/docs/api-reference/audio/createSpeech
const OpenAIProviderOptionsSchema = z.object({
  voice: z
    .enum([
      'alloy',
      'ash',
      'ballad',
      'coral',
      'echo',
      'fable',
      'onyx',
      'nova',
      'sage',
      'shimmer',
      'verse',
    ])
    .default('alloy')
    .optional()
    .describe('The voice to use when generating the audio.'),
  instructions: z
    .string()
    .optional()
    .describe(
      'Control the voice of your generated audio with additional instructions. Does not work with tts-1 or tts-1-hd.',
    ),
  speed: z
    .number()
    .min(0.25)
    .max(4.0)
    .default(1.0)
    .describe('The speed of the generated audio.'),
});

export type OpenAISpeechCallOptions = z.infer<typeof OpenAIProviderOptionsSchema>;

interface OpenAISpeechModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class OpenAISpeechModel implements SpeechModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAISpeechModelId,
    private readonly config: OpenAISpeechModelConfig,
  ) {}

  private getArgs({ text, outputMediaType, providerOptions }: Parameters<SpeechModelV1['doGenerate']>[0]) {
    const warnings: SpeechModelV1CallWarning[] = [];

    // Parse provider options
    const openAIOptions = parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: OpenAIProviderOptionsSchema,
    });

    let responseFormat = outputMediaType ?? 'mp3';

    if (outputMediaType && !['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'].includes(outputMediaType)) {
      warnings.push({
        type: 'unsupported-setting',
        setting: 'outputMediaType',
        details: `Unsupported output media type: ${outputMediaType}. Using mp3 instead.`,
      });
      
      responseFormat = 'mp3';
    }

    // Create request body
    const requestBody: Record<string, unknown> = {
      model: this.modelId,
      input: text,
      voice: 'alloy',
      response_format: responseFormat,
    };

    // Add provider-specific options
    if (openAIOptions) {
      const speechModelOptions: OpenAISpeechAPITypes = {
        voice: openAIOptions.voice,
        speed: openAIOptions.speed,
        instructions: openAIOptions.instructions,
      };

      for (const key in speechModelOptions) {
        const value = speechModelOptions[key as keyof OpenAISpeechAPITypes];
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

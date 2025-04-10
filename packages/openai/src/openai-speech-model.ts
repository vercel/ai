import {
  SpeechModelV1,
  SpeechModelV1CallOptions,
  SpeechModelV1CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import {
  OpenAISpeechModelId,
  OpenAISpeechModelOptions,
} from './openai-speech-settings';

// https://platform.openai.com/docs/api-reference/audio/createSpeech
const OpenAIProviderOptionsSchema = z.object({
  voice: z
    .enum(['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'onyx', 'nova', 'sage', 'shimmer', 'verse'])
    .describe('The voice to use when generating the audio.'),
  instructions: z
    .string()
    .optional()
    .describe('Control the voice of your generated audio with additional instructions. Does not work with tts-1 or tts-1-hd.'),
  response_format: z
    .enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm'])
    .default('mp3')
    .describe('The format of the generated audio.'),
  speed: z
    .number()
    .min(0.25)
    .max(4.0)
    .default(1.0)
    .describe('The speed of the generated audio.'),
});

export type OpenAISpeechCallOptions = Omit<
  SpeechModelV1CallOptions,
  'providerOptions'
> & {
  providerOptions?: {
    openai?: z.infer<typeof OpenAIProviderOptionsSchema>;
  };
};

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

  private getArgs({
    text,
    providerOptions,
  }: OpenAISpeechCallOptions) {
    const warnings: SpeechModelV1CallWarning[] = [];

    // Parse provider options
    const openAIOptions = parseProviderOptions({
      provider: 'openai',
      providerOptions,
      schema: OpenAIProviderOptionsSchema,
    });

    // Create request body
    const requestBody: Record<string, any> = {
      model: this.modelId,
      input: text,
    };

    // Add provider-specific options
    if (openAIOptions) {
      const speechModelOptions: OpenAISpeechModelOptions = {
        voice: openAIOptions.voice,
        speed: openAIOptions.speed,
        response_format: openAIOptions.response_format,
        instructions: openAIOptions.instructions,
      };

      for (const key in speechModelOptions) {
        const value = speechModelOptions[key as keyof OpenAISpeechModelOptions];
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
    options: OpenAISpeechCallOptions,
  ): Promise<Awaited<ReturnType<SpeechModelV1['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { requestBody, warnings } = this.getArgs(options);

    const {
      value: audioBuffer,
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
      successfulResponseHandler: createJsonResponseHandler(
        openaiSpeechResponseSchema,
      ),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Determine content type based on response_format
    const contentType = (() => {
      const format = requestBody.response_format || 'mp3';
      switch (format) {
        case 'mp3': return 'audio/mp3';
        case 'opus': return 'audio/opus';
        case 'aac': return 'audio/aac';
        case 'flac': return 'audio/flac';
        default: return 'audio/mp3';
      }
    })();

    return {
      audioData: audioBuffer,
      contentType,
      durationInSeconds: undefined, // OpenAI doesn't provide duration information
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

const openaiSpeechResponseSchema = z.instanceof(ArrayBuffer);

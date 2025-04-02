import { TranscriptionModelV1 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postFormDataToApi,
  convertAudioInput,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';
import {
  OpenAITranscriptionModelId,
  OpenAITranscriptionSettings,
} from './openai-transcription-settings';

interface OpenAITranscriptionModelConfig extends OpenAIConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class OpenAITranscriptionModel implements TranscriptionModelV1 {
  readonly specificationVersion = 'v1';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: OpenAITranscriptionModelId,
    private readonly settings: OpenAITranscriptionSettings,
    private readonly config: OpenAITranscriptionModelConfig,
  ) {}

  async doGenerate({
    audio,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<TranscriptionModelV1['doGenerate']>[0]): Promise<
    Awaited<ReturnType<TranscriptionModelV1['doGenerate']>>
  > {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const formData = new FormData();
    const file = await convertAudioInput(audio).toFile();

    formData.append('model', this.modelId);
    formData.append('file', file);

    // Add any additional provider options
    if (providerOptions?.openai) {
      for (const [key, value] of Object.entries(providerOptions.openai)) {
        formData.append(key, String(value));
      }
    }

    const { value: response, responseHeaders } = await postFormDataToApi({
      url: this.config.url({
        path: '/audio/transcriptions',
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), headers),
      formData,
      failedResponseHandler: openaiFailedResponseHandler,
      successfulResponseHandler: createJsonResponseHandler(
        openaiTranscriptionResponseSchema,
      ),
      abortSignal,
      fetch: this.config.fetch,
    });

    return {
      transcript: {
        text: response.transcript.text,
        segments: response.transcript.words ?? [],
        language: response.transcript.language,
        duration: response.transcript.duration,
      },
      warnings: [],
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
    };
  }
}

const openaiTranscriptionResponseSchema = z.object({
  transcript: z.object({
    text: z.string(),
    words: z.array(z.any()).optional(),
    language: z.string().optional(),
    duration: z.number().optional(),
  }),
});

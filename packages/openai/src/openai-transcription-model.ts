import { TranscriptionModelV1 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postFormDataToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import { OpenAIConfig } from './openai-config';
import { openaiFailedResponseHandler } from './openai-error';

export type OpenAITranscriptionModelId = 'whisper-1' | (string & {});

export interface OpenAITranscriptionSettings {}

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
    
    formData.append('model', this.modelId);
    formData.append('file', new Blob([Buffer.from(audio, 'base64')]), 'audio.wav');
    
    // Add any additional provider options
    if (providerOptions.openai) {
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
        text: response.text,
        segments: response.words ?? [],
        language: response.language,
        duration: response.duration,
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

// minimal version of the schema, focussed on what is needed for the implementation
const openaiTranscriptionResponseSchema = z.object({
  text: z.string(),
});

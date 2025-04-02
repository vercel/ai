import { TranscriptionModelV1 } from '@ai-sdk/provider';
import {
  combineHeaders,
  createJsonResponseHandler,
  postFormDataToApi,
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

const providerOptionsMapping = {
  include: 'include',
  language: 'language',
  prompt: 'prompt',
  responseFormat: 'response_format',
  temperature: 'temperature',
  timestampGranularities: 'timestamp_granularities',
};

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

    let blob: Blob | undefined;

    if (audio instanceof Uint8Array) {
      // Convert Uint8Array to Blob and then to File
      blob = new Blob([audio]);
    } else if (typeof audio === 'string') {
      // Convert base64 string to Blob and then to File
      const byteCharacters = atob(audio);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      blob = new Blob([byteArray]);
    } else {
      throw new Error('Invalid audio format. Must be Uint8Array or base64 string.');
    }

    formData.append('model', this.modelId);
    formData.append(
      'file',
      new File([blob], 'audio.wav', { type: 'audio/wav' }),
    );

    // Add any additional provider options
    if (providerOptions?.openai) {
      for (const [key, value] of Object.entries(providerOptions.openai)) {
        if (key in providerOptionsMapping) {
          const newKey = providerOptionsMapping[key as keyof typeof providerOptionsMapping];
          
          formData.append(newKey, String(value));
        }
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
        durationInSeconds: response.transcript.duration,
        mimeType: response.transcript.mime_type
      },
      warnings: [],
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
      },
     
      // When using format `verbose_json` on `whisper-1`,, OpenAI includes the things like `task` and enhanced `segments` information.
      providerMetadata: response.transcript,
    };
  }
}

const openaiTranscriptionResponseSchema = z.object({
  transcript: z.object({
    text: z.string(),
    words: z.array(z.any()).optional(),
    language: z.string().optional(),
    duration: z.number().optional(),
    mime_type: z.string(),
  }),
  providerMetadata: z.record(z.any()),
});

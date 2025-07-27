import {
  AISDKError,
  TranscriptionModelV2,
  TranscriptionModelV2CallWarning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  delay,
  getFromApi,
  parseProviderOptions,
  postJsonToApi,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { FalConfig } from './fal-config';
import { falErrorDataSchema, falFailedResponseHandler } from './fal-error';
import { FalTranscriptionModelId } from './fal-transcription-options';
import { FalTranscriptionAPITypes } from './fal-api-types';

// https://fal.ai/models/fal-ai/whisper/api?platform=http
const falProviderOptionsSchema = z.object({
  /**
   * Language of the audio file. If set to null, the language will be automatically detected. Defaults to null.
   *
   * If translate is selected as the task, the audio will be translated to English, regardless of the language selected.
   */
  language: z
    .union([z.enum(['en']), z.string()])
    .nullish()
    .default('en'),

  /**
   * Whether to diarize the audio file. Defaults to true.
   */
  diarize: z.boolean().nullish().default(true),

  /**
   * Level of the chunks to return. Either segment or word. Default value: "segment"
   */
  chunkLevel: z.enum(['segment', 'word']).nullish().default('segment'),

  /**
   * Version of the model to use. All of the models are the Whisper large variant. Default value: "3"
   */
  version: z.enum(['3']).nullish().default('3'),

  /**
   * Default value: 64
   */
  batchSize: z.number().nullish().default(64),

  /**
   * Number of speakers in the audio file. Defaults to null. If not provided, the number of speakers will be automatically detected.
   */
  numSpeakers: z.number().nullable().nullish(),
});

export type FalTranscriptionCallOptions = z.infer<
  typeof falProviderOptionsSchema
>;

interface FalTranscriptionModelConfig extends FalConfig {
  _internal?: {
    currentDate?: () => Date;
  };
}

export class FalTranscriptionModel implements TranscriptionModelV2 {
  readonly specificationVersion = 'v2';

  get provider(): string {
    return this.config.provider;
  }

  constructor(
    readonly modelId: FalTranscriptionModelId,
    private readonly config: FalTranscriptionModelConfig,
  ) {}

  private async getArgs({
    providerOptions,
  }: Parameters<TranscriptionModelV2['doGenerate']>[0]) {
    const warnings: TranscriptionModelV2CallWarning[] = [];

    // Parse provider options
    const falOptions = await parseProviderOptions({
      provider: 'fal',
      providerOptions,
      schema: falProviderOptionsSchema,
    });

    // Create form data with base fields
    const body: Omit<FalTranscriptionAPITypes, 'audio_url'> = {
      task: 'transcribe',
      diarize: true,
      chunk_level: 'word',
    };

    // Add provider-specific options
    if (falOptions) {
      body.language = falOptions.language as never;
      body.version = falOptions.version ?? undefined;
      body.batch_size = falOptions.batchSize ?? undefined;
      body.num_speakers = falOptions.numSpeakers ?? undefined;

      if (typeof falOptions.diarize === 'boolean') {
        body.diarize = falOptions.diarize;
      }

      if (falOptions.chunkLevel) {
        body.chunk_level = falOptions.chunkLevel;
      }
    }

    return {
      body,
      warnings,
    };
  }

  async doGenerate(
    options: Parameters<TranscriptionModelV2['doGenerate']>[0],
  ): Promise<Awaited<ReturnType<TranscriptionModelV2['doGenerate']>>> {
    const currentDate = this.config._internal?.currentDate?.() ?? new Date();
    const { body, warnings } = await this.getArgs(options);

    const base64Audio =
      typeof options.audio === 'string'
        ? options.audio
        : convertUint8ArrayToBase64(options.audio);

    const audioUrl = `data:${options.mediaType};base64,${base64Audio}`;

    const { value: queueResponse } = await postJsonToApi({
      url: this.config.url({
        path: `https://queue.fal.run/fal-ai/${this.modelId}`,
        modelId: this.modelId,
      }),
      headers: combineHeaders(this.config.headers(), options.headers),
      body: {
        ...body,
        audio_url: audioUrl,
      },
      failedResponseHandler: falFailedResponseHandler,
      successfulResponseHandler:
        createJsonResponseHandler(falJobResponseSchema),
      abortSignal: options.abortSignal,
      fetch: this.config.fetch,
    });

    // Poll for completion with timeout
    const startTime = Date.now();
    const timeoutMs = 60000; // 60 seconds timeout
    const pollIntervalMs = 1000; // 1 second interval

    let response;
    let responseHeaders;
    let rawResponse;

    while (true) {
      try {
        const {
          value: statusResponse,
          responseHeaders: statusHeaders,
          rawValue: statusRawResponse,
        } = await getFromApi({
          url: this.config.url({
            path: `https://queue.fal.run/fal-ai/${this.modelId}/requests/${queueResponse.request_id}`,
            modelId: this.modelId,
          }),
          headers: combineHeaders(this.config.headers(), options.headers),
          failedResponseHandler: async ({
            requestBodyValues,
            response,
            url,
          }) => {
            const clone = response.clone();
            const body = (await clone.json()) as { detail: string };

            if (body.detail === 'Request is still in progress') {
              // This is not an error, just a status update that the request is still processing
              // Continue polling by returning a special error that signals to continue
              return {
                value: new Error('Request is still in progress'),
                rawValue: body,
                responseHeaders: {},
              };
            }

            return createJsonErrorResponseHandler({
              errorSchema: falErrorDataSchema,
              errorToMessage: data => data.error.message,
            })({ requestBodyValues, response, url });
          },
          successfulResponseHandler: createJsonResponseHandler(
            falTranscriptionResponseSchema,
          ),
          abortSignal: options.abortSignal,
          fetch: this.config.fetch,
        });

        response = statusResponse;
        responseHeaders = statusHeaders;
        rawResponse = statusRawResponse;
        break;
      } catch (error) {
        // If the error message indicates the request is still in progress, ignore it and continue polling
        if (
          error instanceof Error &&
          error.message === 'Request is still in progress'
        ) {
          // Continue with the polling loop
        } else {
          // Re-throw any other errors
          throw error;
        }
      }

      // Check if we've exceeded the timeout
      if (Date.now() - startTime > timeoutMs) {
        throw new AISDKError({
          message: 'Transcription request timed out after 60 seconds',
          name: 'TranscriptionRequestTimedOut',
          cause: response,
        });
      }

      // Wait before polling again
      await delay(pollIntervalMs);
    }

    return {
      text: response.text,
      segments:
        response.chunks?.map(chunk => ({
          text: chunk.text,
          startSecond: chunk.timestamp?.at(0) ?? 0,
          endSecond: chunk.timestamp?.at(1) ?? 0,
        })) ?? [],
      language: response.inferred_languages?.at(0) ?? undefined,
      durationInSeconds: response.chunks?.at(-1)?.timestamp?.at(1) ?? undefined,
      warnings,
      response: {
        timestamp: currentDate,
        modelId: this.modelId,
        headers: responseHeaders,
        body: rawResponse,
      },
    };
  }
}

const falJobResponseSchema = z.object({
  request_id: z.string().nullish(),
});

const falTranscriptionResponseSchema = z.object({
  text: z.string(),
  chunks: z
    .array(
      z.object({
        text: z.string(),
        timestamp: z.array(z.number()).nullish(),
      }),
    )
    .nullish(),
  inferred_languages: z.array(z.string()).nullish(),
});

import type {
  Experimental_TranscriptionModelV4StreamPart,
  SharedV4ProviderMetadata,
  SharedV4Warning,
  TranscriptionModelV4,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
  createEventSourceResponseHandler,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  postJsonToApi,
  resolve,
  type ParseResult,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';

export class GatewayTranscriptionModel implements TranscriptionModelV4 {
  readonly specificationVersion = 'v4' as const;

  constructor(
    readonly modelId: string,
    private readonly config: GatewayConfig & {
      provider: string;
      o11yHeaders: Resolvable<Record<string, string>>;
    },
  ) {}

  get provider(): string {
    return this.config.provider;
  }

  async doGenerate({
    audio,
    mediaType,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<TranscriptionModelV4['doGenerate']>[0]): Promise<
    Awaited<ReturnType<TranscriptionModelV4['doGenerate']>>
  > {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    try {
      const {
        responseHeaders,
        value: responseBody,
        rawValue,
      } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(false),
          await resolve(this.config.o11yHeaders),
        ),
        body: {
          audio:
            audio instanceof Uint8Array
              ? convertUint8ArrayToBase64(audio)
              : audio,
          mediaType,
          ...(providerOptions && { providerOptions }),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayTranscriptionResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        text: responseBody.text,
        segments: responseBody.segments ?? [],
        language: responseBody.language ?? undefined,
        durationInSeconds: responseBody.durationInSeconds ?? undefined,
        warnings: (responseBody.warnings ?? []) as Array<SharedV4Warning>,
        providerMetadata:
          responseBody.providerMetadata as SharedV4ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
          body: rawValue,
        },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  async doStream({
    audio,
    inputAudioFormat,
    providerOptions,
    headers,
    abortSignal,
    includeRawChunks,
  }: Parameters<NonNullable<TranscriptionModelV4['doStream']>>[0]): Promise<
    Awaited<ReturnType<NonNullable<TranscriptionModelV4['doStream']>>>
  > {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;

    try {
      // The gateway is an HTTP proxy, so the live audio stream is buffered into
      // a single base64 payload before the request. The transcript is then
      // streamed back over SSE. This means transcription starts once all audio
      // has been read, not while it is still being captured.
      const body = {
        audio: await collectAudioAsBase64(audio),
        inputAudioFormat,
        ...(providerOptions && { providerOptions }),
      };

      const { value: response, responseHeaders } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(true),
          await resolve(this.config.o11yHeaders),
        ),
        body,
        successfulResponseHandler: createEventSourceResponseHandler(z.any()),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        stream: response.pipeThrough(
          new TransformStream<
            ParseResult<Experimental_TranscriptionModelV4StreamPart>,
            Experimental_TranscriptionModelV4StreamPart
          >({
            transform(chunk, controller) {
              if (!chunk.success) {
                controller.error(chunk.error);
                return;
              }

              const part = chunk.value;

              // Only surface raw provider chunks when explicitly requested.
              if (part.type === 'raw' && !includeRawChunks) {
                return;
              }

              // Timestamps are serialized as strings over SSE.
              if (
                part.type === 'response-metadata' &&
                typeof part.timestamp === 'string'
              ) {
                part.timestamp = new Date(part.timestamp);
              }

              controller.enqueue(part);
            },
          }),
        ),
        request: { body },
        response: { headers: responseHeaders },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  private getUrl() {
    return `${this.config.baseURL}/transcription-model`;
  }

  private getModelConfigHeaders(streaming: boolean) {
    return {
      'ai-transcription-model-specification-version': '4',
      'ai-model-id': this.modelId,
      'ai-transcription-model-streaming': String(streaming),
    };
  }
}

/**
 * Drains a raw-audio stream into a single base64 payload. `Uint8Array` chunks
 * contain raw bytes; `string` chunks contain base64-encoded raw bytes.
 */
async function collectAudioAsBase64(
  audio: ReadableStream<Uint8Array | string>,
): Promise<string> {
  const reader = audio.getReader();
  const chunks: Array<Uint8Array> = [];
  let totalLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const bytes =
        typeof value === 'string' ? convertBase64ToUint8Array(value) : value;
      chunks.push(bytes);
      totalLength += bytes.length;
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return convertUint8ArrayToBase64(merged);
}

const providerMetadataEntrySchema = z.object({}).catchall(z.unknown());

const gatewayTranscriptionWarningSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('unsupported'),
    feature: z.string(),
    details: z.string().optional(),
  }),
  z.object({
    type: z.literal('compatibility'),
    feature: z.string(),
    details: z.string().optional(),
  }),
  z.object({
    type: z.literal('deprecated'),
    setting: z.string(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('other'),
    message: z.string(),
  }),
]);

const gatewayTranscriptionResponseSchema = z.object({
  text: z.string(),
  segments: z
    .array(
      z.object({
        text: z.string(),
        startSecond: z.number(),
        endSecond: z.number(),
      }),
    )
    .optional(),
  language: z.string().nullish(),
  durationInSeconds: z.number().nullish(),
  warnings: z.array(gatewayTranscriptionWarningSchema).optional(),
  providerMetadata: z
    .record(z.string(), providerMetadataEntrySchema)
    .optional(),
});

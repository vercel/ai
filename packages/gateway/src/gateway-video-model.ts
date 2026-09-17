import {
  APICallError,
  getErrorMessage,
  type Experimental_VideoModelV4 as VideoModelV4,
  type Experimental_VideoModelV4CallOptions as VideoModelV4CallOptions,
  type Experimental_VideoModelV4File as VideoModelV4File,
  type Experimental_VideoModelV4OperationStartResult as VideoModelV4OperationStartResult,
  type Experimental_VideoModelV4OperationStatusResult as VideoModelV4OperationStatusResult,
  type Experimental_VideoModelV4OperationWebhook as VideoModelV4OperationWebhook,
  type Experimental_VideoModelV4VideoData as VideoModelV4VideoData,
  type JSONValue,
  type SharedV4ProviderMetadata,
  type SharedV4Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  parseJsonEventStream,
  postJsonToApi,
  resolve,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import type { GatewayConfig } from './gateway-config';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';

export class GatewayVideoModel implements VideoModelV4 {
  readonly specificationVersion = 'v4' as const;
  // Set a very large number to prevent client-side splitting of requests
  readonly maxVideosPerCall = Number.MAX_SAFE_INTEGER;

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

  async doGenerate(options: VideoModelV4CallOptions): Promise<{
    videos: Array<VideoModelV4VideoData>;
    warnings: Array<SharedV4Warning>;
    providerMetadata?: SharedV4ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    const { headers, abortSignal } = options;
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    try {
      const { responseHeaders, value: responseBody } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
          { accept: 'text/event-stream' },
        ),
        body: this.buildRequestBody(options),
        successfulResponseHandler: async ({
          response,
          url,
          requestBodyValues,
        }: {
          url: string;
          requestBodyValues: unknown;
          response: Response;
        }) => {
          if (response.body == null) {
            throw new APICallError({
              message: 'SSE response body is empty',
              url,
              requestBodyValues,
              statusCode: response.status,
            });
          }

          const eventStream = parseJsonEventStream({
            stream: response.body,
            schema: gatewayVideoEventSchema,
          });

          const reader = eventStream.getReader();
          const { done, value: parseResult } = await reader.read();
          reader.releaseLock();

          if (done || !parseResult) {
            throw new APICallError({
              message: 'SSE stream ended without a data event',
              url,
              requestBodyValues,
              statusCode: response.status,
            });
          }

          if (!parseResult.success) {
            throw new APICallError({
              message: 'Failed to parse video SSE event',
              cause: parseResult.error,
              url,
              requestBodyValues,
              statusCode: response.status,
            });
          }

          const event = parseResult.value;

          if (event.type === 'error') {
            throw new APICallError({
              message: event.message,
              statusCode: event.statusCode,
              url,
              requestBodyValues,
              responseHeaders: Object.fromEntries([...response.headers]),
              responseBody: JSON.stringify(event),
              data: {
                error: {
                  message: event.message,
                  type: event.errorType,
                  param: event.param,
                },
              },
            });
          }

          // event.type === 'result'
          return {
            value: {
              videos: event.videos,
              warnings: event.warnings,
              providerMetadata: event.providerMetadata,
            },
            responseHeaders: Object.fromEntries([...response.headers]),
          };
        },
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        videos: responseBody.videos,
        warnings: responseBody.warnings ?? [],
        providerMetadata: (responseBody.providerMetadata ??
          undefined) as SharedV4ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  // The Gateway notifies the caller's URL on completion (`doStart` maps it to
  // `callbackUrl`), so the factory's URL and `received` pass straight through.
  async handleWebhookOption({
    webhook,
  }: {
    webhook: () => PromiseLike<{
      url: string;
      received: PromiseLike<VideoModelV4OperationWebhook>;
    }>;
  }): Promise<{
    webhookUrl: string;
    received: PromiseLike<VideoModelV4OperationWebhook>;
  }> {
    const { url, received } = await webhook();
    return { webhookUrl: url, received };
  }

  async doStart(
    options: VideoModelV4CallOptions & {
      webhookUrl?: string;
    },
  ): Promise<VideoModelV4OperationStartResult> {
    const { headers, abortSignal, webhookUrl } = options;
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    try {
      const { responseHeaders, value: responseBody } = await postJsonToApi({
        url: this.getStartUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: {
          ...this.buildRequestBody(options),
          // The spec option is `webhookUrl`; the Gateway's wire contract for a
          // completion webhook is `callbackUrl`.
          ...(webhookUrl && { callbackUrl: webhookUrl }),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayVideoStartResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        operation: responseBody.operation as JSONValue,
        warnings: responseBody.warnings ?? [],
        providerMetadata: (responseBody.providerMetadata ??
          undefined) as SharedV4ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  async doStatus({
    operation,
    abortSignal,
    headers,
  }: {
    operation: JSONValue;
    abortSignal?: AbortSignal;
    headers?: Record<string, string | undefined>;
  }): Promise<VideoModelV4OperationStatusResult> {
    const resolvedHeaders = this.config.headers
      ? await resolve(this.config.headers)
      : undefined;
    try {
      const { responseHeaders, value: responseBody } = await postJsonToApi({
        url: this.getStatusUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: { operation },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayVideoStatusResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      const response = {
        timestamp: new Date(),
        modelId: this.modelId,
        headers: responseHeaders,
      };

      if (responseBody.status === 'completed') {
        return {
          status: 'completed',
          videos: responseBody.videos,
          warnings: responseBody.warnings ?? [],
          providerMetadata: (responseBody.providerMetadata ??
            undefined) as SharedV4ProviderMetadata,
          response,
        };
      }

      if (responseBody.status === 'error') {
        return {
          status: 'error',
          error: responseBody.error,
          providerMetadata: (responseBody.providerMetadata ??
            undefined) as SharedV4ProviderMetadata,
          response,
        };
      }

      // The Gateway reports cooperative cancellation as its own terminal
      // status; the v4 operation union has no cancelled state, so surface it
      // as a terminal error rather than polling forever.
      if (responseBody.status === 'cancelled') {
        return {
          status: 'error',
          error: 'Video generation was cancelled.',
          providerMetadata: (responseBody.providerMetadata ??
            undefined) as SharedV4ProviderMetadata,
          response,
        };
      }

      return {
        status: 'pending',
        warnings: responseBody.warnings ?? [],
        providerMetadata: (responseBody.providerMetadata ??
          undefined) as SharedV4ProviderMetadata,
        response,
      };
    } catch (error) {
      throw await asGatewayError(
        error,
        await parseAuthMethod(resolvedHeaders ?? {}),
      );
    }
  }

  private buildRequestBody({
    prompt,
    n,
    aspectRatio,
    resolution,
    duration,
    fps,
    seed,
    generateAudio,
    image,
    frameImages,
    inputReferences,
    providerOptions,
  }: VideoModelV4CallOptions) {
    return {
      prompt,
      n,
      ...(aspectRatio && { aspectRatio }),
      ...(resolution && { resolution }),
      ...(duration && { duration }),
      ...(fps && { fps }),
      ...(seed && { seed }),
      ...(generateAudio !== undefined && { generateAudio }),
      ...(providerOptions && { providerOptions }),
      ...(image && { image: maybeEncodeVideoFile(image) }),
      ...(frameImages && {
        frameImages: frameImages.map(frame => ({
          ...frame,
          image: maybeEncodeVideoFile(frame.image),
        })),
      }),
      ...(inputReferences && {
        inputReferences: inputReferences.map(reference =>
          maybeEncodeVideoFile(reference),
        ),
      }),
    };
  }

  private getUrl() {
    return `${this.config.baseURL}/video-model`;
  }

  private getStartUrl() {
    return `${this.config.baseURL}/video-model/start`;
  }

  private getStatusUrl() {
    return `${this.config.baseURL}/video-model/status`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-video-model-specification-version': '4',
      'ai-model-id': this.modelId,
    };
  }
}

function maybeEncodeVideoFile(file: VideoModelV4File) {
  if (file.type === 'file' && file.data instanceof Uint8Array) {
    return {
      ...file,
      data: convertUint8ArrayToBase64(file.data),
    };
  }
  return file;
}

const providerMetadataEntrySchema = z
  .object({
    videos: z.array(z.unknown()).optional(),
  })
  .catchall(z.unknown());

const gatewayVideoDataSchema = z.union([
  z.object({
    type: z.literal('url'),
    url: z.string(),
    mediaType: z.string(),
  }),
  z.object({
    type: z.literal('base64'),
    data: z.string(),
    mediaType: z.string(),
  }),
]);

const gatewayVideoWarningSchema = z.discriminatedUnion('type', [
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

const gatewayVideoEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('result'),
    videos: z.array(gatewayVideoDataSchema),
    warnings: z.array(gatewayVideoWarningSchema).optional(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .optional(),
  }),
  z.object({
    type: z.literal('error'),
    message: z.string(),
    errorType: z.string(),
    statusCode: z.number(),
    param: z.unknown().nullable(),
  }),
]);

const gatewayVideoStartResponseSchema = z.object({
  operation: z.unknown(),
  warnings: z.array(gatewayVideoWarningSchema).nullish(),
  providerMetadata: z.record(z.string(), providerMetadataEntrySchema).nullish(),
});

const gatewayVideoStatusResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    warnings: z.array(gatewayVideoWarningSchema).nullish(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .nullish(),
  }),
  z.object({
    status: z.literal('completed'),
    videos: z.array(gatewayVideoDataSchema),
    warnings: z.array(gatewayVideoWarningSchema).nullish(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .nullish(),
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .nullish(),
  }),
  z.object({
    status: z.literal('cancelled'),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .nullish(),
  }),
]);

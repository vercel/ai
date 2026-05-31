import type {
  Experimental_VideoModelV3 as VideoModelV3,
  Experimental_VideoModelV3CallOptions as VideoModelV3CallOptions,
  Experimental_VideoModelV3File as VideoModelV3File,
  Experimental_VideoModelV3OperationStartResult as VideoModelV3OperationStartResult,
  Experimental_VideoModelV3OperationStatusResult as VideoModelV3OperationStatusResult,
  Experimental_VideoModelV3VideoData as VideoModelV3VideoData,
  SharedV3ProviderMetadata,
  SharedV3Warning,
} from '@ai-sdk/provider';
import {
  combineHeaders,
  convertUint8ArrayToBase64,
  createJsonResponseHandler,
  createJsonErrorResponseHandler,
  postJsonToApi,
  resolve,
  type Resolvable,
} from '@ai-sdk/provider-utils';
import { z } from 'zod/v4';
import type { GatewayConfig } from './gateway-config';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';

export class GatewayVideoModel implements VideoModelV3 {
  readonly specificationVersion = 'v3' as const;
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

  async doGenerate(options: VideoModelV3CallOptions): Promise<{
    videos: Array<VideoModelV3VideoData>;
    warnings: Array<SharedV3Warning>;
    providerMetadata?: SharedV3ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    const { headers, abortSignal } = options;
    const resolvedHeaders = await resolve(this.config.headers());
    try {
      const { responseHeaders, value: responseBody } = await postJsonToApi({
        url: this.getUrl(),
        headers: combineHeaders(
          resolvedHeaders,
          headers ?? {},
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: this.buildRequestBody(options),
        successfulResponseHandler: createJsonResponseHandler(
          gatewayVideoResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        videos: responseBody.videos,
        warnings: responseBody.warnings ?? [],
        providerMetadata:
          responseBody.providerMetadata as SharedV3ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }

  // `handleWebhookOption` is intentionally NOT implemented yet. The Gateway
  // does not deliver customer webhooks in the async POC (tracked as "Add
  // customer webhook delivery, signing, retries, and dead-letter handling" in
  // the async-workflows remaining work). If this method were present, the SDK
  // core would forward a webhook URL and await a notification that never
  // arrives, with no polling fallback. Until Gateway supports webhooks, async
  // generation is polling-only via `doStatus`. `doStart` still forwards
  // `webhookUrl` when one is supplied, so enabling webhooks later only requires
  // adding `handleWebhookOption` here.

  async doStart(
    options: VideoModelV3CallOptions & {
      webhookUrl?: string;
    },
  ): Promise<VideoModelV3OperationStartResult> {
    const { headers, abortSignal, webhookUrl } = options;
    const resolvedHeaders = await resolve(this.config.headers());
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
          ...(webhookUrl && { webhookUrl }),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayVideoStartResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        operation: responseBody.operation,
        warnings: responseBody.warnings ?? [],
        providerMetadata:
          responseBody.providerMetadata as SharedV3ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }

  async doStatus({
    operation,
    abortSignal,
    headers,
  }: {
    operation: unknown;
    abortSignal?: AbortSignal;
    headers?: Record<string, string | undefined>;
  }): Promise<VideoModelV3OperationStatusResult> {
    const resolvedHeaders = await resolve(this.config.headers());
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
          errorToMessage: data => data,
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
          providerMetadata:
            responseBody.providerMetadata as SharedV3ProviderMetadata,
          response,
        };
      }

      if (responseBody.status === 'error') {
        return {
          status: 'error',
          error: responseBody.error,
          providerMetadata:
            responseBody.providerMetadata as SharedV3ProviderMetadata,
          response,
        };
      }

      return {
        status: 'pending',
        warnings: responseBody.warnings ?? [],
        providerMetadata:
          responseBody.providerMetadata as SharedV3ProviderMetadata,
        response,
      };
    } catch (error) {
      throw await asGatewayError(error, await parseAuthMethod(resolvedHeaders));
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
    image,
    providerOptions,
  }: VideoModelV3CallOptions) {
    return {
      prompt,
      n,
      ...(aspectRatio && { aspectRatio }),
      ...(resolution && { resolution }),
      ...(duration && { duration }),
      ...(fps && { fps }),
      ...(seed && { seed }),
      ...(providerOptions && { providerOptions }),
      ...(image && { image: maybeEncodeVideoFile(image) }),
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
      'ai-video-model-specification-version': '3',
      'ai-model-id': this.modelId,
    };
  }
}

function maybeEncodeVideoFile(file: VideoModelV3File) {
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
    type: z.literal('other'),
    message: z.string(),
  }),
]);

const gatewayVideoResponseSchema = z.object({
  videos: z.array(gatewayVideoDataSchema),
  warnings: z.array(gatewayVideoWarningSchema).optional(),
  providerMetadata: z
    .record(z.string(), providerMetadataEntrySchema)
    .optional(),
});

const gatewayVideoStartResponseSchema = z.object({
  operation: z.unknown(),
  warnings: z.array(gatewayVideoWarningSchema).optional(),
  providerMetadata: z
    .record(z.string(), providerMetadataEntrySchema)
    .optional(),
});

const gatewayVideoStatusResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('pending'),
    warnings: z.array(gatewayVideoWarningSchema).optional(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .optional(),
  }),
  z.object({
    status: z.literal('completed'),
    videos: z.array(gatewayVideoDataSchema),
    warnings: z.array(gatewayVideoWarningSchema).optional(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .optional(),
  }),
  z.object({
    status: z.literal('error'),
    error: z.string(),
    providerMetadata: z
      .record(z.string(), providerMetadataEntrySchema)
      .optional(),
  }),
]);

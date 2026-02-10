import type {
  Experimental_VideoModelV3,
  Experimental_VideoModelV3CallOptions,
  Experimental_VideoModelV3File,
  Experimental_VideoModelV3VideoData,
  SharedV3ProviderMetadata,
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

export class GatewayVideoModel implements Experimental_VideoModelV3 {
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

  async doGenerate({
    prompt,
    n,
    aspectRatio,
    resolution,
    duration,
    fps,
    seed,
    image,
    providerOptions,
    headers,
    abortSignal,
  }: Experimental_VideoModelV3CallOptions): Promise<{
    videos: Array<Experimental_VideoModelV3VideoData>;
    warnings: Array<{ type: 'other'; message: string }>;
    providerMetadata?: SharedV3ProviderMetadata;
    response: {
      timestamp: Date;
      modelId: string;
      headers: Record<string, string> | undefined;
    };
  }> {
    const resolvedHeaders = await resolve(this.config.headers());
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
          this.getModelConfigHeaders(),
          await resolve(this.config.o11yHeaders),
        ),
        body: {
          prompt,
          n,
          ...(aspectRatio && { aspectRatio }),
          ...(resolution && { resolution }),
          ...(duration && { duration }),
          ...(fps && { fps }),
          ...(seed && { seed }),
          ...(providerOptions && { providerOptions }),
          ...(image && { image: maybeEncodeVideoFile(image) }),
        },
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
      throw asGatewayError(error, await parseAuthMethod(resolvedHeaders));
    }
  }

  private getUrl() {
    return `${this.config.baseURL}/video-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-video-model-specification-version': '3',
      'ai-model-id': this.modelId,
    };
  }
}

function maybeEncodeVideoFile(file: Experimental_VideoModelV3File) {
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

const gatewayVideoResponseSchema = z.object({
  videos: z.array(gatewayVideoDataSchema),
  warnings: z
    .array(
      z.object({
        type: z.literal('other'),
        message: z.string(),
      }),
    )
    .optional(),
  providerMetadata: z
    .record(z.string(), providerMetadataEntrySchema)
    .optional(),
});

import type {
  ImageModelV2,
  ImageModelV2CallWarning,
  ImageModelV2ProviderMetadata,
} from '@ai-sdk/provider';
import {
  combineHeaders,
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

export class GatewayImageModel implements ImageModelV2 {
  readonly specificationVersion = 'v2';
  readonly maxImagesPerCall = 4;

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
    size,
    aspectRatio,
    seed,
    providerOptions,
    headers,
    abortSignal,
  }: Parameters<ImageModelV2['doGenerate']>[0]): Promise<
    Awaited<ReturnType<ImageModelV2['doGenerate']>>
  > {
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
          ...(size && { size }),
          ...(aspectRatio && { aspectRatio }),
          ...(seed && { seed }),
          ...(providerOptions ?? {}),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayImageResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        images: responseBody.images, // Always base64 strings from server
        warnings: responseBody.warnings ?? [],
        providerMetadata:
          responseBody.providerMetadata as ImageModelV2ProviderMetadata,
        response: {
          timestamp: new Date(),
          modelId: this.modelId,
          headers: responseHeaders,
        },
      };
    } catch (error) {
      throw asGatewayError(error, parseAuthMethod(resolvedHeaders));
    }
  }

  private getUrl() {
    return `${this.config.baseURL}/image-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-image-model-specification-version': '2',
      'ai-model-id': this.modelId,
    };
  }
}

const gatewayImageResponseSchema = z.object({
  images: z.array(z.string()), // Always base64 strings over the wire
  warnings: z
    .array(
      z.object({
        type: z.literal('other'),
        message: z.string(),
      }),
    )
    .optional(),
  providerMetadata: z
    .record(
      z.string(),
      z
        .object({
          images: z.array(z.unknown()),
        })
        .and(z.record(z.string(), z.unknown())),
    )
    .optional(),
});

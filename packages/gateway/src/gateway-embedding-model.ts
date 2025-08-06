import type { EmbeddingModelV2 } from '@ai-sdk/provider';
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
import type { SharedV2ProviderMetadata } from '@ai-sdk/provider';

export class GatewayEmbeddingModel implements EmbeddingModelV2<string> {
  readonly specificationVersion = 'v2';
  readonly maxEmbeddingsPerCall = 2048;
  readonly supportsParallelCalls = true;

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

  async doEmbed({
    values,
    headers,
    abortSignal,
    providerOptions,
  }: Parameters<EmbeddingModelV2<string>['doEmbed']>[0]): Promise<
    Awaited<ReturnType<EmbeddingModelV2<string>['doEmbed']>>
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
          input: values.length === 1 ? values[0] : values,
          ...(providerOptions ?? {}),
        },
        successfulResponseHandler: createJsonResponseHandler(
          gatewayEmbeddingResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        ...(abortSignal && { abortSignal }),
        fetch: this.config.fetch,
      });

      return {
        embeddings: responseBody.embeddings,
        usage: responseBody.usage ?? undefined,
        providerMetadata:
          responseBody.providerMetadata as unknown as SharedV2ProviderMetadata,
        response: { headers: responseHeaders, body: rawValue },
      };
    } catch (error) {
      throw asGatewayError(error, parseAuthMethod(resolvedHeaders));
    }
  }

  private getUrl() {
    return `${this.config.baseURL}/embedding-model`;
  }

  private getModelConfigHeaders() {
    return {
      'ai-embedding-model-specification-version': '2',
      'ai-model-id': this.modelId,
    };
  }
}

const gatewayEmbeddingResponseSchema = z.object({
  embeddings: z.array(z.array(z.number())),
  usage: z.object({ tokens: z.number() }).nullish(),
  providerMetadata: z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .optional(),
});

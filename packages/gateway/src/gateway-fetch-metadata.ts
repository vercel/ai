import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { asGatewayError } from './errors';
import type { GatewayConfig } from './gateway-config';
import type { GatewayLanguageModelEntry } from './gateway-model-entry';
import { z } from 'zod/v4';

type GatewayFetchMetadataConfig = GatewayConfig;

export interface GatewayFetchMetadataResponse {
  models: GatewayLanguageModelEntry[];
}

export class GatewayFetchMetadata {
  constructor(private readonly config: GatewayFetchMetadataConfig) {}

  async getAvailableModels(): Promise<GatewayFetchMetadataResponse> {
    try {
      const { value } = await getFromApi({
        url: `${this.config.baseURL}/config`,
        headers: await resolve(this.config.headers()),
        successfulResponseHandler: createJsonResponseHandler(
          gatewayFetchMetadataSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => data,
        }),
        fetch: this.config.fetch,
      });

      return value;
    } catch (error) {
      throw asGatewayError(error);
    }
  }
}

const gatewayLanguageModelSpecificationSchema = z.object({
  specificationVersion: z.literal('v2'),
  provider: z.string(),
  modelId: z.string(),
});

const gatewayLanguageModelPricingSchema = z
  .object({
    input: z.string(),
    output: z.string(),
    input_cache_read: z.string().optional(),
    input_cache_write: z.string().optional(),
  })
  .transform(({ input, output, input_cache_read, input_cache_write }) => ({
    input,
    output,
    ...(input_cache_read
      ? { cachedInputTokens: input_cache_read }
      : {}),
    ...(input_cache_write
      ? { cacheCreationInputTokens: input_cache_write }
      : {}),
  }));

const gatewayLanguageModelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  pricing: gatewayLanguageModelPricingSchema.nullish(),
  specification: gatewayLanguageModelSpecificationSchema,
  modelType: z.enum(['language', 'embedding', 'image']).nullish(),
});

const gatewayFetchMetadataSchema = z.object({
  models: z.array(gatewayLanguageModelEntrySchema),
});

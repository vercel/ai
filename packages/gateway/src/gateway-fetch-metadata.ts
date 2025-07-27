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

const gatewayLanguageModelPricingSchema = z.object({
  input: z.string(),
  output: z.string(),
});

const gatewayLanguageModelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullish(),
  pricing: gatewayLanguageModelPricingSchema.nullish(),
  specification: gatewayLanguageModelSpecificationSchema,
});

const gatewayFetchMetadataSchema = z.object({
  models: z.array(gatewayLanguageModelEntrySchema),
});

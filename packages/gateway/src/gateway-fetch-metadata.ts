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

export interface GatewayCreditsResponse {
  balance: string;
  total_used: string;
}

export interface GatewayGenerationResponse {
  timestamp: string;
  projectId: string;
  ownerId: string;
  referrerUrl: string;
  appName: string;
  environment: string;
  deploymentId: string;
  gatewayModelId: string;
  model: string;
  modelType: string;
  provider: string;
  currency: string;
  marketCostCurrency: string;
  cachedInputTokensCurrency: string;
  cacheCreationInputTokensCurrency: string;
  responseStatusCode: number;
  inputCostPerToken: number;
  inputCostPerTokenCurrency: string;
  outputCostPerToken: number;
  outputCostPerTokenCurrency: string;
  gatewayTimestamp: string;
  isFreeTier: string;
  isByok: string;
  generationId: string;
  cost: number;
  marketCost: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  reasoningTokens: number;
  requestDurationMs: number;
  timeToFirstTokenMs: number;
  tokenThroughput: number;
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

  async getCredits(): Promise<GatewayCreditsResponse> {
    try {
      const baseUrl = new URL(this.config.baseURL);
      const creditsUrl = `${baseUrl.origin}/v1/credits`;

      const { value } = await getFromApi({
        url: creditsUrl,
        headers: await resolve(this.config.headers()),
        successfulResponseHandler:
          createJsonResponseHandler(gatewayCreditsSchema),
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

  async getGeneration(
    generationId: string,
  ): Promise<GatewayGenerationResponse> {
    try {
      const baseUrl = new URL(this.config.baseURL);

      const { value } = await getFromApi({
        url: `${baseUrl.origin}/v1/generation?id=${encodeURIComponent(generationId)}`,
        headers: await resolve(this.config.headers()),
        successfulResponseHandler: createJsonResponseHandler(
          gatewayGenerationSchema,
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
    input_cache_read: z.string().nullish(),
    input_cache_write: z.string().nullish(),
  })
  .transform(({ input, output, input_cache_read, input_cache_write }) => ({
    input,
    output,
    ...(input_cache_read ? { cachedInputTokens: input_cache_read } : {}),
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

const gatewayCreditsSchema = z.object({
  balance: z.string(),
  total_used: z.string(),
});

const gatewayGenerationSchema = z.object({
  timestamp: z.string(),
  projectId: z.string(),
  ownerId: z.string(),
  referrerUrl: z.string(),
  appName: z.string(),
  environment: z.string(),
  deploymentId: z.string(),
  gatewayModelId: z.string(),
  model: z.string(),
  modelType: z.string(),
  provider: z.string(),
  currency: z.string(),
  marketCostCurrency: z.string(),
  cachedInputTokensCurrency: z.string(),
  cacheCreationInputTokensCurrency: z.string(),
  responseStatusCode: z.number(),
  inputCostPerToken: z.number(),
  inputCostPerTokenCurrency: z.string(),
  outputCostPerToken: z.number(),
  outputCostPerTokenCurrency: z.string(),
  gatewayTimestamp: z.string(),
  isFreeTier: z.string(),
  isByok: z.string(),
  generationId: z.string(),
  cost: z.number(),
  marketCost: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cachedInputTokens: z.number(),
  cacheCreationInputTokens: z.number(),
  reasoningTokens: z.number(),
  requestDurationMs: z.number(),
  timeToFirstTokenMs: z.number(),
  tokenThroughput: z.number(),
});

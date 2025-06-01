import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getFromApi,
  resolve,
} from '@ai-sdk/provider-utils';
import { z } from 'zod';
import type { GatewayConfig } from './gateway-config';
import type { GatewayLanguageModelEntry } from './gateway-model-entry';
import { GatewayError } from './errors';
import { extractApiCallResponse } from './errors';
import { createGatewayErrorFromResponse } from './errors';
import { APICallError } from '@ai-sdk/provider';

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
      if (GatewayError.isInstance(error)) {
        throw error;
      }

      if (APICallError.isInstance(error)) {
        throw createGatewayErrorFromResponse({
          response: extractApiCallResponse(error),
          statusCode: error.statusCode ?? 500,
          defaultMessage: 'Failed to fetch Gateway configuration',
          cause: error,
        });
      }

      throw createGatewayErrorFromResponse({
        response: {},
        statusCode: 500,
        defaultMessage:
          error instanceof Error
            ? `Failed to fetch Gateway configuration: ${error.message}`
            : 'Unknown error fetching Gateway configuration',
        cause: error,
      });
    }
  }
}

const gatewayLanguageModelSpecificationSchema = z.object({
  specificationVersion: z.literal('v2'),
  provider: z.string(),
  modelId: z.string(),
});

const gatewayLanguageModelEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  specification: gatewayLanguageModelSpecificationSchema,
});

const gatewayFetchMetadataSchema = z.object({
  models: z.array(gatewayLanguageModelEntrySchema),
});

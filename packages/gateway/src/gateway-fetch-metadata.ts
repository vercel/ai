import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  getFromApi,
  lazySchema,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { z } from './zod';
import { asGatewayError } from './errors';
import type { GatewayConfig } from './gateway-config';
import { VERCEL_AI_GATEWAY_TEAM_HEADER } from './gateway-headers';
import {
  KNOWN_MODEL_TYPES,
  type GatewayLanguageModelEntry,
  type KnownModelType,
} from './gateway-model-entry';
type GatewayFetchMetadataConfig = GatewayConfig;

export interface GatewayFetchMetadataResponse {
  models: GatewayLanguageModelEntry[];
}

export interface GatewayCreditsResponse {
  /** The remaining gateway credit balance available for API usage */
  balance: string;
  /** The total amount of gateway credits that have been consumed */
  totalUsed: string;
}

export class GatewayFetchMetadata {
  constructor(private readonly config: GatewayFetchMetadataConfig) {}

  async getAvailableModels(): Promise<GatewayFetchMetadataResponse> {
    try {
      const { value } = await getFromApi({
        url: `${this.config.baseURL}/config`,
        validateUrl: false,
        headers: this.config.headers
          ? await resolve(this.config.headers)
          : undefined,
        successfulResponseHandler: createJsonResponseHandler(
          gatewayAvailableModelsResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        fetch: this.config.fetch,
      });

      return value;
    } catch (error) {
      throw await asGatewayError(error);
    }
  }

  async getCredits(): Promise<GatewayCreditsResponse> {
    try {
      const baseUrl = new URL(this.config.baseURL);
      const headers = this.config.headers
        ? await resolve(this.config.headers)
        : undefined;

      // The credits endpoint selects the team from the `teamId` / `slug`
      // query parameter rather than the team header, so forward it there.
      // Without it, tokens that can access multiple teams (e.g. Vercel access
      // tokens) cannot be scoped to a team and the request is rejected.
      const url = new URL('/v1/credits', baseUrl.origin);
      const teamIdOrSlug = getTeamIdOrSlug(headers);
      if (teamIdOrSlug) {
        url.searchParams.set(
          teamIdOrSlug.startsWith('team_') ? 'teamId' : 'slug',
          teamIdOrSlug,
        );
      }

      const { value } = await getFromApi({
        url: url.toString(),
        validateUrl: false,
        headers,
        successfulResponseHandler: createJsonResponseHandler(
          gatewayCreditsResponseSchema,
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        fetch: this.config.fetch,
      });

      return value;
    } catch (error) {
      throw await asGatewayError(error);
    }
  }
}

function getTeamIdOrSlug(
  headers: Record<string, string | undefined> | undefined,
): string | undefined {
  if (!headers) return undefined;
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === VERCEL_AI_GATEWAY_TEAM_HEADER) {
      return value?.trim() || undefined;
    }
  }
  return undefined;
}

const gatewayAvailableModelsResponseSchema = lazySchema(() =>
  zodSchema(
    z.object({
      models: z
        .array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string().nullish(),
            pricing: z
              .object({
                input: z.string(),
                output: z.string(),
                input_cache_read: z.string().nullish(),
                input_cache_write: z.string().nullish(),
              })
              .transform(
                ({ input, output, input_cache_read, input_cache_write }) => ({
                  input,
                  output,
                  ...(input_cache_read
                    ? { cachedInputTokens: input_cache_read }
                    : {}),
                  ...(input_cache_write
                    ? { cacheCreationInputTokens: input_cache_write }
                    : {}),
                }),
              )
              .nullish(),
            specification: z.object({
              specificationVersion: z.literal('v4'),
              provider: z.string(),
              modelId: z.string(),
            }),
            modelType: z.string().nullish(),
          }),
        )
        .transform(models =>
          models.filter(
            (m): m is typeof m & { modelType?: KnownModelType | null } =>
              m.modelType == null ||
              KNOWN_MODEL_TYPES.includes(m.modelType as KnownModelType),
          ),
        ),
    }),
  ),
);

const gatewayCreditsResponseSchema = lazySchema(() =>
  zodSchema(
    z
      .object({
        balance: z.string(),
        total_used: z.string(),
      })
      .transform(({ balance, total_used }) => ({
        balance,
        totalUsed: total_used,
      })),
  ),
);

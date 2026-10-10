import {
  createJsonErrorResponseHandler,
  createJsonResponseHandler,
  getErrorMessage,
  getFromApi,
  resolve,
  zodSchema,
} from '@ai-sdk/provider-utils';
import { asGatewayError } from './errors';
import { parseAuthMethod } from './errors/parse-auth-method';
import type { GatewayConfig } from './gateway-config';
import type { GatewayRestCreditsResponse } from './gateway-fetch-metadata';
import type {
  GatewayGenerationInfoParams,
  GatewayRestGenerationInfoResponse,
} from './gateway-generation-info';
import type {
  GatewayRestModelEndpointsParams,
  GatewayRestModelEndpointsResponse,
  GatewayRestModelsResponse,
} from './gateway-rest-types';
import type {
  GatewayRestSpendReportResponse,
  GatewaySpendReportParams,
} from './gateway-spend-report';
import { z } from './zod';

type GatewayRequestRouteResponses = {
  'GET /v1/models': GatewayRestModelsResponse;
  'GET /v1/models/{creator}/{model}/endpoints': GatewayRestModelEndpointsResponse;
  'GET /v1/credits': GatewayRestCreditsResponse;
  'GET /v1/generation': GatewayRestGenerationInfoResponse;
  'GET /v1/report': GatewayRestSpendReportResponse;
};

type GatewayRequestRouteParameters = {
  'GET /v1/models': never;
  'GET /v1/models/{creator}/{model}/endpoints': GatewayRestModelEndpointsParams;
  'GET /v1/credits': never;
  'GET /v1/generation': GatewayGenerationInfoParams;
  'GET /v1/report': GatewaySpendReportParams;
};

/** A Gateway REST request supported by {@link GatewayProvider.request}. */
export type GatewayRequestRoute = keyof GatewayRequestRouteResponses;

/** The response type for a supported Gateway REST request. */
export type GatewayRequestResponse<ROUTE extends GatewayRequestRoute> =
  GatewayRequestRouteResponses[ROUTE];

/** The parameters accepted by a supported Gateway REST request. */
export type GatewayRequestParameters<ROUTE extends GatewayRequestRoute> =
  GatewayRequestRouteParameters[ROUTE];

export type GatewayRequestArguments<ROUTE extends GatewayRequestRoute> = [
  GatewayRequestParameters<ROUTE>,
] extends [never]
  ? []
  : [params: GatewayRequestParameters<ROUTE>];

export class GatewayRequest {
  constructor(
    private readonly config: Pick<
      GatewayConfig,
      'baseURL' | 'fetch' | 'headers'
    >,
  ) {}

  async request<ROUTE extends GatewayRequestRoute>(
    route: ROUTE,
    ...args: GatewayRequestArguments<ROUTE>
  ): Promise<GatewayRequestResponse<ROUTE>> {
    const definition = gatewayRequestDefinitions[route];
    let headers: Record<string, string | undefined> | undefined;

    try {
      headers = definition.requiresAuth
        ? this.config.headers
          ? await resolve(this.config.headers)
          : undefined
        : undefined;

      const { value } = await getFromApi({
        url: definition.createUrl(this.config.baseURL, args[0]),
        validateUrl: false,
        headers,
        successfulResponseHandler: createJsonResponseHandler(
          zodSchema(z.any()),
        ),
        failedResponseHandler: createJsonErrorResponseHandler({
          errorSchema: z.any(),
          errorToMessage: data => getErrorMessage(data) ?? 'unknown error',
        }),
        fetch: this.config.fetch,
      });

      return value as GatewayRequestResponse<ROUTE>;
    } catch (error) {
      throw await asGatewayError(
        error,
        headers ? await parseAuthMethod(headers) : undefined,
      );
    }
  }
}

const gatewayRequestDefinitions = {
  'GET /v1/models': {
    requiresAuth: false,
    createUrl: (baseURL: string) => new URL('/v1/models', baseURL).toString(),
  },
  'GET /v1/models/{creator}/{model}/endpoints': {
    requiresAuth: false,
    createUrl: (baseURL: string, params: unknown) => {
      const { creator, model } = params as GatewayRestModelEndpointsParams;

      return new URL(
        `/v1/models/${encodeURIComponent(creator)}/${encodeURIComponent(model)}/endpoints`,
        baseURL,
      ).toString();
    },
  },
  'GET /v1/credits': {
    requiresAuth: true,
    createUrl: (baseURL: string) => new URL('/v1/credits', baseURL).toString(),
  },
  'GET /v1/generation': {
    requiresAuth: true,
    createUrl: (baseURL: string, params: unknown) => {
      const { id } = params as GatewayGenerationInfoParams;
      const url = new URL('/v1/generation', baseURL);
      url.searchParams.set('id', id);
      return url.toString();
    },
  },
  'GET /v1/report': {
    requiresAuth: true,
    createUrl: (baseURL: string, params: unknown) => {
      const reportParams = params as GatewaySpendReportParams;
      const url = new URL('/v1/report', baseURL);
      url.searchParams.set('start_date', reportParams.startDate);
      url.searchParams.set('end_date', reportParams.endDate);

      if (reportParams.groupBy) {
        url.searchParams.set('group_by', reportParams.groupBy);
      }
      if (reportParams.datePart) {
        url.searchParams.set('date_part', reportParams.datePart);
      }
      if (reportParams.userId) {
        url.searchParams.set('user_id', reportParams.userId);
      }
      if (reportParams.model) {
        url.searchParams.set('model', reportParams.model);
      }
      if (reportParams.provider) {
        url.searchParams.set('provider', reportParams.provider);
      }
      if (reportParams.credentialType) {
        url.searchParams.set('credential_type', reportParams.credentialType);
      }
      if (reportParams.tags && reportParams.tags.length > 0) {
        url.searchParams.set('tags', reportParams.tags.join(','));
      }

      return url.toString();
    },
  },
} satisfies Record<
  GatewayRequestRoute,
  {
    requiresAuth: boolean;
    createUrl: (baseURL: string, params?: unknown) => string;
  }
>;

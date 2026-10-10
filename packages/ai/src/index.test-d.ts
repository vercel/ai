import type {
  GatewayRequestResponse as GatewayRequestResponseFromGateway,
  GatewayRequestRoute as GatewayRequestRouteFromGateway,
  GatewayRestModelEndpointsResponse as GatewayRestModelEndpointsResponseFromGateway,
  GatewayRestModelsResponse as GatewayRestModelsResponseFromGateway,
} from '@ai-sdk/gateway';
import { describe, expectTypeOf, it } from 'vitest';
import type {
  GatewayRequestResponse,
  GatewayRequestRoute,
  GatewayRestModelEndpointsResponse,
  GatewayRestModelsResponse,
} from './index';

describe('AI SDK exports', () => {
  it('re-exports Gateway REST request types', () => {
    expectTypeOf<GatewayRestModelsResponse>().toEqualTypeOf<GatewayRestModelsResponseFromGateway>();
    expectTypeOf<GatewayRequestRoute>().toEqualTypeOf<GatewayRequestRouteFromGateway>();
    expectTypeOf<GatewayRequestResponse<'GET /v1/models'>>().toEqualTypeOf<
      GatewayRequestResponseFromGateway<'GET /v1/models'>
    >();
    expectTypeOf<GatewayRestModelEndpointsResponse>().toEqualTypeOf<GatewayRestModelEndpointsResponseFromGateway>();
  });
});

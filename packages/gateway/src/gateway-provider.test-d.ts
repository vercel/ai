import type {
  Experimental_BatchV4 as BatchV4,
  LanguageModelV4,
} from '@ai-sdk/provider';
import { expectTypeOf, it } from 'vitest';
import { createGateway } from './gateway-provider';
import {
  gateway,
  type GatewayAsyncJobMetadata,
  type GatewayModelId,
  type GatewayProviderMetadata,
  type GatewayProviderOptions,
  type GatewayRequestParameters,
  type GatewayRequestRoute,
  type GatewayRequestResponse,
  type GatewayRestCreditsResponse,
  type GatewayRestGenerationInfoResponse,
  type GatewayRestModelEndpointsParams,
  type GatewayRestModelEndpointsResponse,
  type GatewayRestModelsResponse,
  type GatewayRestSpendReportResponse,
} from './index';

const restModelsResponse = {
  object: 'list',
  data: [
    {
      id: 'anthropic/claude-sonnet-4.5',
      object: 'model',
      created: 1_755_815_280,
      owned_by: 'anthropic',
      name: 'Claude Sonnet 4.5',
      description: 'A capable language model.',
      context_window: 200_000,
      max_tokens: 64_000,
      type: 'language',
      tags: ['reasoning', 'tool-use'],
      supported_parameters: ['reasoning'],
      reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
      pricing: {
        input: '0.000003',
        output: '0.000015',
        input_tiers: [{ cost: '0.000006', min: 200_000 }],
      },
      service_owned_field: true,
    },
  ],
} satisfies GatewayRestModelsResponse;

void restModelsResponse;

it('types Gateway REST requests', () => {
  expectTypeOf(gateway.request('GET /v1/models')).toEqualTypeOf<
    Promise<GatewayRestModelsResponse>
  >();
  expectTypeOf(
    gateway.request('GET /v1/models/{creator}/{model}/endpoints', {
      creator: 'anthropic',
      model: 'claude-sonnet-4.5',
    }),
  ).toEqualTypeOf<Promise<GatewayRestModelEndpointsResponse>>();
  expectTypeOf(gateway.request('GET /v1/credits')).toEqualTypeOf<
    Promise<GatewayRestCreditsResponse>
  >();
  expectTypeOf(
    gateway.request('GET /v1/generation', { id: 'gen_123' }),
  ).toEqualTypeOf<Promise<GatewayRestGenerationInfoResponse>>();
  expectTypeOf(
    gateway.request('GET /v1/report', {
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    }),
  ).toEqualTypeOf<Promise<GatewayRestSpendReportResponse>>();
  expectTypeOf<GatewayRequestRoute>().toEqualTypeOf<
    | 'GET /v1/models'
    | 'GET /v1/models/{creator}/{model}/endpoints'
    | 'GET /v1/credits'
    | 'GET /v1/generation'
    | 'GET /v1/report'
  >();
  expectTypeOf<
    GatewayRequestResponse<'GET /v1/models'>
  >().toEqualTypeOf<GatewayRestModelsResponse>();
  expectTypeOf<
    GatewayRequestParameters<'GET /v1/models/{creator}/{model}/endpoints'>
  >().toEqualTypeOf<GatewayRestModelEndpointsParams>();

  // @ts-expect-error unsupported Gateway REST routes are rejected
  gateway.request('GET /v1/unsupported');
  // @ts-expect-error model endpoint requests require their path parameters
  gateway.request('GET /v1/models/{creator}/{model}/endpoints');
  // @ts-expect-error parameterless routes do not accept request parameters
  gateway.request('GET /v1/models', {});
});

it('types batch support on the Gateway provider', () => {
  expectTypeOf(gateway.experimental_batch()).toMatchTypeOf<
    BatchV4<{ text: GatewayModelId }>
  >();
  expectTypeOf(
    gateway('anthropic/claude-sonnet-4.5'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    gateway.languageModel('anthropic/claude-sonnet-4.5'),
  ).toEqualTypeOf<LanguageModelV4>();
  expectTypeOf(
    gateway.chat('anthropic/claude-sonnet-4.5'),
  ).toEqualTypeOf<LanguageModelV4>();
});

const asyncJob = {
  jobId: 'job_123',
  status: 'queued',
  webhookSigningSecret: 'whsec_123',
} satisfies GatewayAsyncJobMetadata;

const providerMetadata = { asyncJob } satisfies GatewayProviderMetadata;
void providerMetadata;

createGateway({ apiKey: 'vck_test-key' });
createGateway({ apiKey: 'vca_test-token' });
createGateway({ apiKey: 'vca_test-token', teamIdOrSlug: 'vercel' });
createGateway({ teamIdOrSlug: 'vercel' });
createGateway({});

// @ts-expect-error token is not a supported Gateway provider setting
createGateway({ token: 'vca_test-token' });

it('types weight-format conditions in has', () => {
  expectTypeOf<GatewayProviderOptions['has']>().toEqualTypeOf<
    | (
        | 'implicit-caching'
        | 'reasoning'
        | 'structured-output'
        | 'tool-use'
        | 'vision'
        | `quantization:${string}`
        | `!quantization:${string}`
      )[]
    | undefined
  >();

  const options = {
    has: ['quantization:fp8', '!quantization:int4'],
  } satisfies GatewayProviderOptions;
  void options;

  expectTypeOf<'quantization:fp8'>().toMatchTypeOf<
    NonNullable<GatewayProviderOptions['has']>[number]
  >();
  expectTypeOf<'!quantization:fp8'>().toMatchTypeOf<
    NonNullable<GatewayProviderOptions['has']>[number]
  >();
  expectTypeOf<'quantization'>().not.toMatchTypeOf<
    NonNullable<GatewayProviderOptions['has']>[number]
  >();
  expectTypeOf<'fp8'>().not.toMatchTypeOf<
    NonNullable<GatewayProviderOptions['has']>[number]
  >();
});

it('types structured-output in has', () => {
  const options = {
    has: ['structured-output', 'tool-use'],
  } satisfies GatewayProviderOptions;
  void options;

  expectTypeOf<'structured-output'>().toMatchTypeOf<
    NonNullable<GatewayProviderOptions['has']>[number]
  >();
  expectTypeOf<'structured-outputs'>().not.toMatchTypeOf<
    NonNullable<GatewayProviderOptions['has']>[number]
  >();
});

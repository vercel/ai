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
} from './index';

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

// Routing metadata passes through untyped, under the index signature.
const evaluationFallbackMetadata = {
  generationId: 'gen_fallback',
  routing: {
    originalModelId: 'typesafe-ai/jev',
    modelAttempts: [
      {
        canonicalSlug: 'typesafe-ai/jev',
        success: true,
        providerAttemptCount: 1,
        providerAttempts: [],
        generationId: 'gen_primary',
        usage: { inputTokens: 10, outputTokens: 2 },
        cost: '0.001',
        marketCost: '0.001',
      },
      {
        canonicalSlug: 'openai/gpt-5.6-sol',
        success: true,
        providerAttemptCount: 1,
        providerAttempts: [],
        generationId: 'gen_fallback',
        usage: { inputTokens: 12, outputTokens: 3 },
        triggeredBy: [{ question: 'department', reason: 'confidence_below' }],
        cost: '0.002',
      },
    ],
  },
} satisfies GatewayProviderMetadata;
void evaluationFallbackMetadata;

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

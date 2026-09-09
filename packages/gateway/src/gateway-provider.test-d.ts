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

createGateway({ apiKey: 'vck_test-key' });
createGateway({ apiKey: 'vca_test-token' });
createGateway({ apiKey: 'vca_test-token', teamIdOrSlug: 'vercel' });
createGateway({ teamIdOrSlug: 'vercel' });
createGateway({});

// @ts-expect-error token is not a supported Gateway provider setting
createGateway({ token: 'vca_test-token' });

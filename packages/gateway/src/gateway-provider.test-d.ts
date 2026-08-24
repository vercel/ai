import { createGateway } from './gateway-provider';
import type { GatewayAsyncJobMetadata, GatewayProviderMetadata } from './index';

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

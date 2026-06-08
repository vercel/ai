import { createGateway } from './gateway-provider';
import type { GatewayProviderOptions } from './gateway-provider-options';

createGateway({ apiKey: 'vck_test-key' });
createGateway({ apiKey: 'vca_test-token' });
createGateway({ apiKey: 'vca_test-token', teamIdOrSlug: 'vercel' });
createGateway({ teamIdOrSlug: 'vercel' });
createGateway({});

// @ts-expect-error token is not a supported Gateway provider setting
createGateway({ token: 'vca_test-token' });

// Test GatewayProviderOptions type includes caching
const _providerOptions = {
  caching: 'auto',
  only: ['openai', 'anthropic'],
  order: ['bedrock', 'azure'],
  sort: 'cost',
  user: 'user-123',
  tags: ['chat', 'v2'],
  models: ['openai/gpt-4o', 'anthropic/claude-3'],
  zeroDataRetention: true,
  disallowPromptTraining: true,
  hipaaCompliant: true,
  quotaEntityId: 'entity-123',
  serviceTier: 'flex',
} satisfies GatewayProviderOptions;

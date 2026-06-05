import { createGateway } from './gateway-provider';
import type { GatewayProviderOptions } from './gateway-provider-options';

createGateway({ apiKey: 'vck_test-key' });
createGateway({ apiKey: 'vca_test-token' });
createGateway({ apiKey: 'vca_test-token', teamIdOrSlug: 'vercel' });
createGateway({ teamIdOrSlug: 'vercel' });
createGateway({});

const gatewayProviderOptions = {
  caching: 'auto',
} satisfies GatewayProviderOptions;

gatewayProviderOptions.caching satisfies 'auto';

// @ts-expect-error token is not a supported Gateway provider setting
createGateway({ token: 'vca_test-token' });

import type { HarnessV1Authentication } from '@ai-sdk/harness';
import {
  getAiGatewayAuthFromEnv,
  isHarnessAuthenticationEnvironment,
} from '@ai-sdk/harness/utils';

export type FxAuthenticationMode = HarnessV1Authentication;

export function resolveFxEnv({
  auth = 'auto',
  env = process.env,
}: {
  auth?: FxAuthenticationMode;
  env?: Record<string, string | undefined>;
} = {}): Record<string, string> {
  const gateway = getAiGatewayAuthFromEnv({
    env: isHarnessAuthenticationEnvironment(auth) ? auth : env,
  });
  return {
    ...(gateway.apiKey ? { AI_GATEWAY_API_KEY: gateway.apiKey } : {}),
    AI_GATEWAY_BASE_URL: gateway.baseUrl,
  };
}

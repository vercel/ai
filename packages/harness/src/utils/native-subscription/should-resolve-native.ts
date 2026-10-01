import type { HarnessV1Authentication } from '../../v1/harness-authentication';
import { getAiGatewayAuthFromEnv } from '../ai-gateway-auth';

export function shouldResolveNativeSubscription({
  auth,
  env,
  hasDirectCredential,
}: {
  auth: Extract<HarnessV1Authentication, string> | undefined;
  env: Readonly<Record<string, string | undefined>>;
  hasDirectCredential: boolean;
}): boolean {
  return (
    auth !== 'ai-gateway' &&
    !hasDirectCredential &&
    (auth === 'direct' || getAiGatewayAuthFromEnv({ env }).apiKey == null)
  );
}

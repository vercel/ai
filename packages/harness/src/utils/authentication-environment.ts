import type { HarnessV1AuthenticationEnvironment } from '../v1/harness-authentication';

export function isHarnessAuthenticationEnvironment(
  value: unknown,
): value is HarnessV1AuthenticationEnvironment {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string')
  );
}

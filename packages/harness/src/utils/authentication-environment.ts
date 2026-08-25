import type { HarnessAuthenticationEnvironment } from '../harness-authentication-environment';

export function isHarnessAuthenticationEnvironment(
  value: unknown,
): value is HarnessAuthenticationEnvironment {
  return (
    value != null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every(entry => typeof entry === 'string')
  );
}

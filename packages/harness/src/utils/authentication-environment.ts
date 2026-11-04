import type { HarnessV1AuthenticationEnvironment } from '../v1/harness-authentication';

export function isHarnessAuthenticationEnvironment(
  value: unknown,
): value is HarnessV1AuthenticationEnvironment {
  if (value == null || typeof value !== 'object') {
    return false;
  }

  if (
    Array.isArray(value) ||
    Object.values(value).some(entry => typeof entry !== 'string')
  ) {
    throw new TypeError(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  }

  return true;
}

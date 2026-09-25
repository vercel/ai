import { describe, expect, it } from 'vitest';
import { isHarnessAuthenticationEnvironment } from './authentication-environment';

describe('isHarnessAuthenticationEnvironment', () => {
  it('recognizes flat string records', () => {
    expect(isHarnessAuthenticationEnvironment({})).toBe(true);
    expect(
      isHarnessAuthenticationEnvironment({
        AI_GATEWAY_API_KEY: 'gateway-key',
        AI_GATEWAY_BASE_URL: 'https://gateway.example',
      }),
    ).toBe(true);
  });

  it('returns false for authentication modes and missing values', () => {
    expect(isHarnessAuthenticationEnvironment('auto')).toBe(false);
    expect(isHarnessAuthenticationEnvironment(undefined)).toBe(false);
  });

  it('rejects nested authentication objects', () => {
    expect(() =>
      isHarnessAuthenticationEnvironment({
        gateway: { apiKey: 'gateway-key' },
      }),
    ).toThrow(
      'Invalid auth: expected an authentication mode or a flat record with string values.',
    );
  });
});

import { describe, expect, it } from 'vitest';
import { shouldResolveNativeSubscription } from './should-resolve-native';

describe('shouldResolveNativeSubscription', () => {
  it.each([
    { auth: undefined, env: {}, hasDirectCredential: false, expected: true },
    { auth: 'auto', env: {}, hasDirectCredential: false, expected: true },
    {
      auth: 'auto',
      env: { AI_GATEWAY_API_KEY: 'gateway-key' },
      hasDirectCredential: false,
      expected: false,
    },
    {
      auth: undefined,
      env: { VERCEL_OIDC_TOKEN: 'oidc-token' },
      hasDirectCredential: false,
      expected: false,
    },
    {
      auth: 'direct',
      env: { AI_GATEWAY_API_KEY: 'gateway-key' },
      hasDirectCredential: false,
      expected: true,
    },
    {
      auth: 'ai-gateway',
      env: {},
      hasDirectCredential: false,
      expected: false,
    },
    {
      auth: 'direct',
      env: {},
      hasDirectCredential: true,
      expected: false,
    },
  ] as const)(
    'returns $expected for auth $auth, env $env, and hasDirectCredential $hasDirectCredential',
    ({ auth, env, hasDirectCredential, expected }) => {
      expect(
        shouldResolveNativeSubscription({
          auth,
          env,
          hasDirectCredential,
        }),
      ).toBe(expected);
    },
  );
});

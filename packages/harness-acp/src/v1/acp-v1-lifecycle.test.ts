import { describe, expect, it } from 'vitest';
import {
  resolveACPInitialGuidanceApplied,
  validateACPLifecycleCompatibility,
} from './acp-v1-lifecycle';

describe('ACP prompt guidance lifecycle', () => {
  it('applies guidance to a fresh session', () => {
    expect(
      resolveACPInitialGuidanceApplied({
        isResume: false,
        lifecycleState: { initialGuidanceApplied: true },
      }),
    ).toBe(false);
  });

  it('does not reannounce guidance when a legacy resume state lacks the flag', () => {
    expect(
      resolveACPInitialGuidanceApplied({
        isResume: true,
        lifecycleState: undefined,
      }),
    ).toBe(true);
  });

  it('preserves an explicit resume guidance flag', () => {
    expect(
      resolveACPInitialGuidanceApplied({
        isResume: true,
        lifecycleState: { initialGuidanceApplied: false },
      }),
    ).toBe(false);
  });
});

describe('validateACPLifecycleCompatibility', () => {
  const authenticationProfile = {
    digest: 'authentication-profile',
    providerKind: 'direct',
    providerMode: 'direct',
  } as const;
  const lifecycleData = {
    implementationIdentity: 'implementation',
    authenticationProfile,
    bridge: {
      port: 4319,
      token: 'bridge-token',
      lastSeenEventId: 7,
      sandboxId: 'sandbox-1',
    },
  } as const;

  it('accepts matching harness, implementation, auth, and sandbox identities', () => {
    expect(() =>
      validateACPLifecycleCompatibility({
        harnessId: 'portable-acp',
        lifecycleHarnessId: 'portable-acp',
        implementationIdentity: 'implementation',
        authenticationProfile,
        lifecycleData,
        sandboxId: 'sandbox-1',
      }),
    ).not.toThrow();
  });

  it.each([
    {
      name: 'harness',
      options: { lifecycleHarnessId: 'other-acp' },
      error: 'produced by harness',
    },
    {
      name: 'implementation',
      options: { implementationIdentity: 'other-implementation' },
      error: 'configured implementation',
    },
    {
      name: 'authentication profile',
      options: {
        authenticationProfile: {
          ...authenticationProfile,
          digest: 'other-authentication',
        },
      },
      error: 'authentication profile',
    },
    {
      name: 'sandbox',
      options: { sandboxId: 'sandbox-2' },
      error: 'belongs to sandbox',
    },
  ])('rejects a mismatched $name before attach', ({ options, error }) => {
    expect(() =>
      validateACPLifecycleCompatibility({
        harnessId: 'portable-acp',
        lifecycleHarnessId: 'portable-acp',
        implementationIdentity: 'implementation',
        authenticationProfile,
        lifecycleData,
        sandboxId: 'sandbox-1',
        ...options,
      }),
    ).toThrow(error);
  });
});

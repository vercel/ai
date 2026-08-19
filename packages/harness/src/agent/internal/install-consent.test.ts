import { describe, expect, test, vi } from 'vitest';
import { buildRequestInstallConsent } from './install-consent';
import type { HarnessAgentAdapter } from '../harness-agent-types';
import type { HarnessV1NetworkSandboxSession } from '../../v1';

function makeHarness(
  installation?: HarnessAgentAdapter['installation'],
): HarnessAgentAdapter {
  return {
    specificationVersion: 'harness-v1',
    harnessId: 'mock',
    builtinTools: {},
    doStart: async () => {
      throw new Error('unused');
    },
    ...(installation != null ? { installation } : {}),
  } as HarnessAgentAdapter;
}

function makeSession(
  environmentOwner?: 'provider' | 'user',
): HarnessV1NetworkSandboxSession {
  return {
    ...(environmentOwner != null ? { environmentOwner } : {}),
  } as HarnessV1NetworkSandboxSession;
}

const installation = {
  executable: 'claude',
  command: 'npm install -g @anthropic-ai/claude-code',
};

describe('buildRequestInstallConsent', () => {
  test('is absent when the adapter declares no installation', () => {
    expect(
      buildRequestInstallConsent({
        harness: makeHarness(),
        sandboxSession: makeSession(),
        onInstallRequest: true,
      }),
    ).toBeUndefined();
  });

  test('permits installation into a provider-owned sandbox by default', async () => {
    const consent = buildRequestInstallConsent({
      harness: makeHarness(installation),
      sandboxSession: makeSession(),
      onInstallRequest: undefined,
    });
    await expect(consent!()).resolves.toBe(true);

    const explicit = buildRequestInstallConsent({
      harness: makeHarness(installation),
      sandboxSession: makeSession('provider'),
      onInstallRequest: undefined,
    });
    await expect(explicit!()).resolves.toBe(true);
  });

  test('denies installation into a user-owned environment by default', async () => {
    const consent = buildRequestInstallConsent({
      harness: makeHarness(installation),
      sandboxSession: makeSession('user'),
      onInstallRequest: undefined,
    });
    await expect(consent!()).resolves.toBe(false);
  });

  test('an explicit boolean setting wins over ownership', async () => {
    const granted = buildRequestInstallConsent({
      harness: makeHarness(installation),
      sandboxSession: makeSession('user'),
      onInstallRequest: true,
    });
    await expect(granted!()).resolves.toBe(true);

    const denied = buildRequestInstallConsent({
      harness: makeHarness(installation),
      sandboxSession: makeSession('provider'),
      onInstallRequest: false,
    });
    await expect(denied!()).resolves.toBe(false);
  });

  test('a function setting is asked with the declared installation', async () => {
    const onInstallRequest = vi.fn(async () => true);
    const consent = buildRequestInstallConsent({
      harness: makeHarness(installation),
      sandboxSession: makeSession('user'),
      onInstallRequest,
    });

    await expect(consent!()).resolves.toBe(true);
    expect(onInstallRequest).toHaveBeenCalledWith({
      harnessId: 'mock',
      executable: 'claude',
      command: 'npm install -g @anthropic-ai/claude-code',
    });
  });
});

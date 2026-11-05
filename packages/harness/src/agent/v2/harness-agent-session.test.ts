import {
  WORKFLOW_DESERIALIZE,
  WORKFLOW_SERIALIZE,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import { describe, expect, test, vi } from 'vitest';
import {
  DefaultHarnessAgentSession,
  type HarnessAgentSandboxSessionResolver,
} from './harness-agent-session';

describe('DefaultHarnessAgentSession', () => {
  test('returns a supplied sandbox session without resolving it', async () => {
    const sandboxSession = {} as SandboxSession;
    const resolver = vi.fn(async () => ({}) as SandboxSession);
    const session = new DefaultHarnessAgentSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
      sandboxSession,
    });
    session.setSandboxSessionResolver(resolver);

    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
    expect(resolver).not.toHaveBeenCalled();
  });

  test('lazily resolves and caches the sandbox session', async () => {
    const sandboxSession = {} as SandboxSession;
    const resolver = vi.fn(async () => sandboxSession);
    const session = new DefaultHarnessAgentSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });
    session.setSandboxSessionResolver(resolver);

    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(resolver).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: expect.any(AbortSignal),
    });
  });

  test('aborts an in-progress sandbox lookup when its resolver is replaced', async () => {
    const session = new DefaultHarnessAgentSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });
    const sandboxSession = {} as SandboxSession;
    let resolutionAbortSignal: AbortSignal | undefined;
    const staleResolver: HarnessAgentSandboxSessionResolver = ({
      abortSignal,
    }) => {
      resolutionAbortSignal = abortSignal;
      return new Promise<SandboxSession>((_, reject) => {
        abortSignal.addEventListener(
          'abort',
          () => reject(new Error('sandbox lookup aborted')),
          { once: true },
        );
      });
    };
    const currentResolver: HarnessAgentSandboxSessionResolver = async ({
      abortSignal,
    }) => {
      expect(abortSignal.aborted).toBe(false);
      return sandboxSession;
    };
    const staleResolverSpy = vi.fn(staleResolver);
    const currentResolverSpy = vi.fn(currentResolver);

    session.setSandboxSessionResolver(staleResolverSpy);
    const pendingResolution = session.getSandboxSession();
    const pendingRejection = expect(pendingResolution).rejects.toThrow(
      'sandbox lookup aborted',
    );
    expect(resolutionAbortSignal?.aborted).toBe(false);

    session.setSandboxSessionResolver(currentResolverSpy);
    expect(resolutionAbortSignal?.aborted).toBe(true);
    await pendingRejection;

    await expect(session.getSandboxSession()).resolves.toBe(sandboxSession);
    expect(staleResolverSpy).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: resolutionAbortSignal,
    });
    expect(currentResolverSpy).toHaveBeenCalledWith({
      sandboxId: 'sandbox-id',
      abortSignal: expect.any(AbortSignal),
    });
  });

  test('serializes only session identity', async () => {
    const sandboxSession = {} as SandboxSession;
    const session = new DefaultHarnessAgentSession({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
      sandboxSession,
    });
    session.setSandboxSessionResolver(async () => sandboxSession);

    const serialized = DefaultHarnessAgentSession[WORKFLOW_SERIALIZE](session);
    expect(serialized).toEqual({
      sessionId: 'session-id',
      sandboxId: 'sandbox-id',
    });

    const restored =
      DefaultHarnessAgentSession[WORKFLOW_DESERIALIZE](serialized);
    await expect(restored.getSandboxSession()).rejects.toThrow(
      'no sandbox session or sandbox session resolver is available',
    );
  });
});

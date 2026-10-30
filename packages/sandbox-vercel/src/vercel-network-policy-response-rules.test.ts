import { readFileSync } from 'node:fs';
import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { type NetworkPolicy, Sandbox } from '@vercel/sandbox';
import { describe, expect, it, vi } from 'vitest';
import { VercelNetworkPolicyManager } from './vercel-network-policy-manager';
import { VercelNetworkSandboxSession } from './vercel-network-sandbox-session';

const fixture = JSON.parse(
  readFileSync(
    new URL(
      './__fixtures__/network-policy-response-rules-readback.json',
      import.meta.url,
    ),
    'utf8',
  ),
) as {
  requestedPolicy: NetworkPolicy;
  createResponseNetworkPolicy: Record<string, unknown>;
  nativeReadback: NetworkPolicy;
};

const operations = [
  'addRequestTransformations',
  'setRequestTransformations',
  'setNetworkPolicy',
] as const;

const transformations = [
  {
    match: { host: 'example.com' },
    transform: { headers: { 'x-example': '1' } },
  },
];

function mutate(
  manager: Pick<VercelNetworkPolicyManager, (typeof operations)[number]>,
  operation: (typeof operations)[number],
) {
  return operation === 'setNetworkPolicy'
    ? manager.setNetworkPolicy({
        mode: 'custom',
        allowedHosts: ['registry.npmjs.org', 'example.com'],
      })
    : manager[operation](transformations);
}

function makeManager({
  networkPolicy = fixture.nativeReadback,
  sessions = [
    { id: 'session', networkPolicy: fixture.createResponseNetworkPolicy },
  ],
}: {
  networkPolicy?: NetworkPolicy;
  sessions?: Array<{ id: string; networkPolicy?: Record<string, unknown> }>;
} = {}) {
  const update = vi.fn(async () => {});
  const listSessions = vi.fn(async () => ({
    async *[Symbol.asyncIterator]() {
      yield* sessions;
    },
  }));
  const sandbox = {
    currentSession: () => ({ networkPolicy, sessionId: 'session' }),
    listSessions,
    update,
  } as unknown as Sandbox;
  return {
    manager: new VercelNetworkPolicyManager({ sandbox }),
    update,
    listSessions,
  };
}

describe('Vercel network policy response rules', () => {
  it.each(operations)(
    '%s rejects response rules supplied in the current policy without updating',
    async operation => {
      const policy = structuredClone(fixture.requestedPolicy);
      const { manager, update, listSessions } = makeManager({
        networkPolicy: policy,
      });

      await expect(mutate(manager, operation)).rejects.toBeInstanceOf(
        HarnessCapabilityUnsupportedError,
      );
      await expect(mutate(manager, operation)).rejects.toThrow(
        'response rules',
      );

      expect(update).not.toHaveBeenCalled();
      expect(listSessions).not.toHaveBeenCalled();
      expect(policy).toEqual(fixture.requestedPolicy);
    },
  );

  it.each(operations)(
    '%s rejects response rules omitted by native SDK readback',
    async operation => {
      const sessionMetadata = {
        id: 'session',
        memory: 2048,
        vcpus: 1,
        region: 'iad1',
        timeout: 120000,
        status: 'running',
        requestedAt: 1,
        createdAt: 1,
        updatedAt: 1,
        cwd: '/vercel/sandbox',
        networkPolicy: fixture.createResponseNetworkPolicy,
      };
      const fetchMock = vi.fn<typeof fetch>();
      fetchMock.mockResolvedValueOnce(
        Response.json({
          sandbox: {
            name: 'response-rule-sandbox',
            persistent: false,
            currentSessionId: 'session',
            status: 'running',
            createdAt: 1,
            updatedAt: 1,
          },
          session: sessionMetadata,
          routes: [],
        }),
      );
      fetchMock.mockResolvedValueOnce(
        Response.json({
          sessions: [{ ...sessionMetadata, id: 'other-session' }],
          pagination: { count: 1, next: 'next-page' },
        }),
      );
      fetchMock.mockResolvedValueOnce(
        Response.json({
          sessions: [sessionMetadata],
          pagination: { count: 1, next: null },
        }),
      );
      const sandbox = await Sandbox.get({
        name: 'response-rule-sandbox',
        token: 'test-token',
        teamId: 'test-team',
        projectId: 'test-project',
        fetch: fetchMock,
      });
      const session = new VercelNetworkSandboxSession({
        sandbox,
        ownsLifecycle: false,
      });

      expect(sandbox.currentSession().networkPolicy).toEqual(
        fixture.nativeReadback,
      );
      await expect(mutate(session, operation)).rejects.toBeInstanceOf(
        HarnessCapabilityUnsupportedError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(
        fetchMock.mock.calls.every(([, init]) =>
          [undefined, 'GET'].includes(init?.method),
        ),
      ).toBe(true);
      expect(sandbox.currentSession().networkPolicy).toEqual(
        fixture.nativeReadback,
      );
    },
  );

  it.each([
    { sessions: [] },
    { sessions: [{ id: 'other-session', networkPolicy: { mode: 'custom' } }] },
    { sessions: [{ id: 'session' }] },
  ])(
    'rejects when the current session policy cannot be inspected: $sessions',
    async ({ sessions }) => {
      const { manager, update } = makeManager({ sessions });

      await expect(
        manager.addRequestTransformations(transformations),
      ).rejects.toThrow('could not be inspected');
      expect(update).not.toHaveBeenCalled();
    },
  );

  it('rejects an unrecognized response-rules representation', async () => {
    const { manager, update } = makeManager({
      sessions: [
        {
          id: 'session',
          networkPolicy: { mode: 'custom', responseRules: {} },
        },
      ],
    });

    await expect(
      manager.addRequestTransformations(transformations),
    ).rejects.toThrow('response rules');
    expect(update).not.toHaveBeenCalled();
  });

  it('does not commit state when inspection fails and allows a safe retry', async () => {
    const { manager, update, listSessions } = makeManager({
      sessions: [
        { id: 'session', networkPolicy: { mode: 'custom', responseRules: [] } },
      ],
    });
    listSessions.mockRejectedValueOnce(new Error('inspection failed'));

    await expect(
      manager.addRequestTransformations(transformations),
    ).rejects.toThrow('inspection failed');
    expect(update).not.toHaveBeenCalled();

    await manager.addRequestTransformations(transformations);
    await manager.setRequestTransformations(transformations);

    expect(listSessions).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledExactlyOnceWith({
      networkPolicy: {
        allow: {
          'registry.npmjs.org': [],
          'example.com': [{ transform: [{ headers: { 'x-example': '1' } }] }],
        },
      },
    });
  });
});

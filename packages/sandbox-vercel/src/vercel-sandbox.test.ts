import type { NetworkPolicy, Sandbox } from '@vercel/sandbox';
import {
  HarnessSandboxAuthenticationError,
  type HarnessV1NetworkSandboxSession,
} from '@ai-sdk/harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVercelSandbox } from './vercel-sandbox';

const { createMock, getMock, getOrCreateMock } = vi.hoisted(() => ({
  createMock: vi.fn(),
  getMock: vi.fn(),
  getOrCreateMock: vi.fn(),
}));

vi.mock('@vercel/sandbox', () => ({
  Sandbox: {
    create: createMock,
    get: getMock,
    getOrCreate: getOrCreateMock,
  },
}));

type MockSpies = {
  domain: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  runCommand: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  routes: Array<{ port: number }>;
  networkPolicy: NetworkPolicy | undefined;
};

function makeMockSandbox(overrides: Partial<MockSpies> = {}) {
  const domain = overrides.domain ?? vi.fn();
  const update = overrides.update ?? vi.fn(async () => {});
  const runCommand = overrides.runCommand ?? vi.fn();
  const stop = overrides.stop ?? vi.fn(async () => {});
  const deleteSandbox = overrides.delete ?? vi.fn(async () => {});
  const routes: Array<{ port: number }> = overrides.routes ?? [{ port: 4000 }];
  const networkPolicy = overrides.networkPolicy;
  const sandbox = {
    name: 'sbx_harness',
    domain,
    update,
    runCommand,
    stop,
    delete: deleteSandbox,
    routes,
    networkPolicy,
    currentSession: () => ({
      cwd: '/vercel/sandbox',
      networkPolicy,
    }),
  } as unknown as Sandbox;
  return {
    sandbox,
    spies: {
      domain,
      update,
      runCommand,
      stop,
      delete: deleteSandbox,
      routes,
      networkPolicy,
    },
  };
}

function getSetRequestTransformations(
  session: HarnessV1NetworkSandboxSession,
): NonNullable<HarnessV1NetworkSandboxSession['setRequestTransformations']> {
  const setRequestTransformations = session.setRequestTransformations;
  if (setRequestTransformations == null) {
    throw new Error(
      'Expected Vercel Sandbox to support request transformations.',
    );
  }
  return setRequestTransformations;
}

function getAddRequestTransformations(
  session: HarnessV1NetworkSandboxSession,
): NonNullable<HarnessV1NetworkSandboxSession['addRequestTransformations']> {
  const addRequestTransformations = session.addRequestTransformations;
  if (addRequestTransformations == null) {
    throw new Error(
      'Expected Vercel Sandbox to support additive request transformations.',
    );
  }
  return addRequestTransformations;
}

async function captureError(promise: PromiseLike<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected promise to reject');
}

describe('createVercelSandbox (wrap existing)', () => {
  it('produces a network sandbox session whose ports come from sandbox.routes', async () => {
    const { sandbox } = makeMockSandbox({
      routes: [{ port: 3000 }, { port: 4000 }],
    });
    const provider = createVercelSandbox({ sandbox });
    const sandboxSession = await provider.createSession();
    expect(sandboxSession.ports).toEqual([3000, 4000]);
  });

  it('restricted() returns an Experimental_SandboxSession wrapping the underlying', async () => {
    const { sandbox, spies } = makeMockSandbox();
    spies.runCommand.mockResolvedValueOnce({
      exitCode: 0,
      stdout: async () => 'ok\n',
      stderr: async () => '',
    });

    const sandboxSession = await createVercelSandbox({
      sandbox,
    }).createSession();
    const result = await sandboxSession
      .restricted()
      .run({ command: 'echo ok' });
    expect(result.stdout).toBe('ok\n');
  });

  it('stop is a no-op (caller owns lifecycle)', async () => {
    const { sandbox, spies } = makeMockSandbox();
    await (await createVercelSandbox({ sandbox }).createSession()).stop();
    expect(spies.stop).not.toHaveBeenCalled();
  });

  it('destroy is a no-op (caller owns lifecycle)', async () => {
    const { sandbox, spies } = makeMockSandbox();
    await (await createVercelSandbox({ sandbox }).createSession()).destroy();
    expect(spies.stop).not.toHaveBeenCalled();
    expect(spies.delete).not.toHaveBeenCalled();
  });

  describe('getPortEndpoint', () => {
    it('returns the value from sandbox.domain for https', async () => {
      const { sandbox, spies } = makeMockSandbox({
        routes: [{ port: 3000 }],
      });
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');

      const handle = await createVercelSandbox({ sandbox }).createSession();
      const endpoint = await handle.getPortEndpoint({ port: 3000 });
      expect(spies.domain).toHaveBeenCalledWith(3000);
      expect(endpoint).toEqual({ url: 'https://sub.vercel.run/' });
    });

    it('upgrades ws to wss when domain is https', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');
      const handle = await createVercelSandbox({ sandbox }).createSession();
      const endpoint = await handle.getPortEndpoint({
        port: 4000,
        protocol: 'ws',
      });
      expect(endpoint).toEqual({ url: 'wss://sub.vercel.run/' });
    });

    it('keeps ws as ws when domain is http', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('http://sub.vercel.run');
      const handle = await createVercelSandbox({ sandbox }).createSession();
      const endpoint = await handle.getPortEndpoint({
        port: 4000,
        protocol: 'ws',
      });
      expect(endpoint).toEqual({ url: 'ws://sub.vercel.run/' });
    });

    it('throws when the requested port is not in the sandbox routes', async () => {
      const { sandbox } = makeMockSandbox({ routes: [{ port: 4000 }] });
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await expect(handle.getPortEndpoint({ port: 9999 })).rejects.toThrow(
        /Port 9999 is not exposed/,
      );
    });

    it('keeps getPortUrl as a compatibility wrapper', async () => {
      const { sandbox, spies } = makeMockSandbox();
      spies.domain.mockReturnValueOnce('https://sub.vercel.run');
      const handle = await createVercelSandbox({ sandbox }).createSession();

      await expect(
        handle.getPortUrl({ port: 4000, protocol: 'ws' }),
      ).resolves.toBe('wss://sub.vercel.run/');
    });
  });

  describe('setNetworkPolicy', () => {
    it('maps allow-all', async () => {
      const { sandbox, spies } = makeMockSandbox({
        networkPolicy: 'deny-all',
      });
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setNetworkPolicy!({ mode: 'allow-all' });
      expect(spies.update).toHaveBeenCalledWith({ networkPolicy: 'allow-all' });
    });

    it('maps deny-all', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setNetworkPolicy!({ mode: 'deny-all' });
      expect(spies.update).toHaveBeenCalledWith({ networkPolicy: 'deny-all' });
    });

    it('maps custom with allowedHosts to { allow: [...] }', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedHosts: ['api.example.com', '*.npmjs.org'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: { allow: ['api.example.com', '*.npmjs.org'] },
      });
    });

    it('maps custom with allowedCIDRs to { subnets: { allow: [...] } }', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedCIDRs: ['10.0.0.0/8'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: { subnets: { allow: ['10.0.0.0/8'] } },
      });
    });

    it('maps custom with allowedHosts + deniedCIDRs to combined shape', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedHosts: ['api.example.com'],
        deniedCIDRs: ['169.254.169.254/32'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: {
          allow: ['api.example.com'],
          subnets: { deny: ['169.254.169.254/32'] },
        },
      });
    });

    it('maps custom with both allowedCIDRs + deniedCIDRs', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedCIDRs: ['10.0.0.0/8'],
        deniedCIDRs: ['10.5.0.0/16'],
      });
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: {
          subnets: { allow: ['10.0.0.0/8'], deny: ['10.5.0.0/16'] },
        },
      });
    });
  });

  describe('setRequestTransformations', () => {
    const credentialTransformation = {
      match: {
        host: 'ai-gateway.vercel.sh',
        method: ['POST'],
        path: { startsWith: '/v1/' },
      },
      transform: {
        headers: { authorization: 'Bearer host-only-credential' },
      },
    } as const;

    it('preserves allow-all when only request transformations are configured', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await getSetRequestTransformations(handle)([credentialTransformation]);
      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: {
          allow: {
            'ai-gateway.vercel.sh': [
              {
                match: {
                  method: ['POST'],
                  path: { startsWith: '/v1/' },
                },
                transform: [
                  {
                    headers: {
                      authorization: 'Bearer host-only-credential',
                    },
                  },
                ],
              },
            ],
            '*': [],
          },
        },
      });
    });

    it('groups several request transformations for the same host', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await getSetRequestTransformations(handle)([
        credentialTransformation,
        {
          match: { host: 'ai-gateway.vercel.sh', path: { exact: '/models' } },
          transform: { headers: { 'x-api-key': 'second-credential' } },
        },
      ]);
      const update = spies.update.mock.calls.at(-1)?.[0];
      expect(
        (
          update?.networkPolicy as
            | {
                allow: Record<string, ReadonlyArray<unknown>>;
              }
            | undefined
        )?.allow['ai-gateway.vercel.sh'],
      ).toHaveLength(2);
    });

    it('keeps access policy authoritative regardless of setter order', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await getSetRequestTransformations(handle)([credentialTransformation]);
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedHosts: ['registry.npmjs.org'],
        deniedCIDRs: ['169.254.169.254/32'],
      });
      expect(spies.update).toHaveBeenLastCalledWith({
        networkPolicy: {
          allow: ['registry.npmjs.org'],
          subnets: { deny: ['169.254.169.254/32'] },
        },
      });
    });

    it('keeps transformations pending when the initial policy does not allow their host', async () => {
      const { sandbox, spies } = makeMockSandbox({
        networkPolicy: { allow: ['registry.npmjs.org'] },
      });
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await getSetRequestTransformations(handle)([credentialTransformation]);
      expect(spies.update).not.toHaveBeenCalled();

      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedHosts: ['ai-gateway.vercel.sh'],
      });
      expect(spies.update).toHaveBeenLastCalledWith({
        networkPolicy: {
          allow: {
            'ai-gateway.vercel.sh': expect.any(Array),
          },
        },
      });
    });

    it('restores the access policy when request transformations are cleared', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setNetworkPolicy!({
        mode: 'custom',
        allowedHosts: ['registry.npmjs.org'],
      });
      const setRequestTransformations = getSetRequestTransformations(handle);
      await setRequestTransformations([credentialTransformation]);
      await setRequestTransformations([]);
      expect(spies.update).toHaveBeenLastCalledWith({
        networkPolicy: { allow: ['registry.npmjs.org'] },
      });
    });
  });

  describe('addRequestTransformations', () => {
    it('delegates additive transformations to the policy manager', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();

      await getAddRequestTransformations(handle)([
        {
          match: { host: 'api.example.com' },
          transform: { headers: { authorization: 'Bearer secret' } },
        },
      ]);

      expect(spies.update).toHaveBeenCalledWith({
        networkPolicy: {
          allow: {
            '*': [],
            'api.example.com': [
              {
                transform: [{ headers: { authorization: 'Bearer secret' } }],
              },
            ],
          },
        },
      });
    });
  });

  describe('setPorts', () => {
    it('forwards the requested port list to sandbox.update', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const handle = await createVercelSandbox({ sandbox }).createSession();
      await handle.setPorts!([4000, 5000]);
      expect(spies.update).toHaveBeenCalledWith(
        { ports: [4000, 5000] },
        undefined,
      );
    });
  });
});

describe('createVercelSandbox (create from scratch)', () => {
  beforeEach(() => {
    createMock.mockReset();
    getMock.mockReset();
    getOrCreateMock.mockReset();
    (
      globalThis as {
        [key: symbol]: Map<string, string> | undefined;
      }
    )[Symbol.for('ai-sdk.harness.vercel-template-snapshots')]?.clear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('reports the opaque missing-auth path failure as sandbox authentication', async () => {
    vi.stubEnv('VERCEL_OIDC_TOKEN', '');
    const cause = Object.assign(
      new TypeError(
        'The "path" argument must be of type string. Received undefined',
      ),
      { code: 'ERR_INVALID_ARG_TYPE' },
    );
    createMock.mockRejectedValueOnce(cause);

    const error = await captureError(createVercelSandbox({}).createSession());

    expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(true);
    if (!HarnessSandboxAuthenticationError.isInstance(error)) {
      throw new Error('Expected sandbox authentication error');
    }
    expect(error.message).toMatchInlineSnapshot(
      `"Vercel Sandbox authentication failed. Set VERCEL_OIDC_TOKEN, or pass token, teamId, and projectId to createVercelSandbox(), then verify that they can access Vercel Sandbox."`,
    );
    expect(error.sandboxProviderId).toBe('vercel-sandbox');
    expect(error.cause).toBe(cause);
  });

  it('reports nested OIDC credential failures as sandbox authentication', async () => {
    const cause = Object.assign(new Error('Could not resolve local OIDC'), {
      name: 'LocalOidcContextError',
    });
    getMock.mockRejectedValueOnce(
      Object.assign(new Error('Sandbox lookup failed'), { cause }),
    );

    const error = await captureError(
      createVercelSandbox({}).resumeSession!({
        sessionId: 'session-123',
      }),
    );

    expect(HarnessSandboxAuthenticationError.isInstance(error)).toBe(true);
    if (!HarnessSandboxAuthenticationError.isInstance(error)) {
      throw new Error('Expected sandbox authentication error');
    }
    expect(error.cause).toMatchInlineSnapshot(`[Error: Sandbox lookup failed]`);
  });

  it('preserves unrelated Vercel Sandbox failures', async () => {
    const cause = new Error('Sandbox service unavailable');
    createMock.mockRejectedValueOnce(cause);

    const error = await captureError(createVercelSandbox({}).createSession());

    expect(error).toBe(cause);
  });

  it('does not treat an opaque path error as missing auth when explicit credentials are configured', async () => {
    const cause = Object.assign(
      new TypeError(
        'The "path" argument must be of type string. Received undefined',
      ),
      { code: 'ERR_INVALID_ARG_TYPE' },
    );
    createMock.mockRejectedValueOnce(cause);

    const error = await captureError(
      createVercelSandbox({
        token: 'token_test',
        teamId: 'team_test',
        projectId: 'prj_test',
      }).createSession(),
    );

    expect(error).toBe(cause);
  });

  it('preserves the Node 24 runtime and 30 minute timeout defaults', async () => {
    const { sandbox } = makeMockSandbox();
    createMock.mockResolvedValueOnce(sandbox);

    await createVercelSandbox({}).createSession();

    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][0]).toMatchObject({
      runtime: 'node24',
      timeout: 30 * 60 * 1_000,
    });
  });

  it('does not add the legacy runtime when an image is provided', async () => {
    const { sandbox } = makeMockSandbox();
    createMock.mockResolvedValueOnce(sandbox);

    await createVercelSandbox({
      image: 'vercel/sandbox/universal',
    }).createSession();

    expect(createMock.mock.calls[0][0]).toMatchObject({
      image: 'vercel/sandbox/universal',
    });
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('runtime');
  });

  it('uses an image for a template without forwarding it to snapshot forks', async () => {
    const { sandbox: template } = makeMockSandbox();
    const { sandbox: fork } = makeMockSandbox();
    Object.assign(template, { currentSnapshotId: 'snap_123' });
    getOrCreateMock.mockResolvedValueOnce(template);
    createMock.mockResolvedValueOnce(fork);

    await createVercelSandbox({
      image: 'vercel/sandbox/universal',
    }).createSession({
      identity: 'template-test',
      onFirstCreate: async () => {},
    });

    expect(getOrCreateMock.mock.calls[0][0]).toMatchObject({
      image: 'vercel/sandbox/universal',
    });
    expect(createMock.mock.calls[0][0]).toMatchObject({
      source: { type: 'snapshot', snapshotId: 'snap_123' },
    });
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('image');
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('runtime');
  });

  it('does not add the legacy runtime when restoring a snapshot', async () => {
    const { sandbox } = makeMockSandbox();
    createMock.mockResolvedValueOnce(sandbox);

    await createVercelSandbox({
      source: { type: 'snapshot', snapshotId: 'snap_123' },
    }).createSession();

    expect(createMock.mock.calls[0][0]).toMatchObject({
      source: { type: 'snapshot', snapshotId: 'snap_123' },
    });
    expect(createMock.mock.calls[0][0]).not.toHaveProperty('runtime');
  });

  it('respects an explicitly provided timeout', async () => {
    const { sandbox } = makeMockSandbox();
    createMock.mockResolvedValueOnce(sandbox);

    await createVercelSandbox({ timeout: 60_000 }).createSession();

    expect(createMock.mock.calls[0][0]).toMatchObject({ timeout: 60_000 });
  });

  it('destroy stops before deleting owned sandboxes', async () => {
    const calls: string[] = [];
    const { sandbox, spies } = makeMockSandbox({
      stop: vi.fn(async () => {
        calls.push('stop');
      }),
      delete: vi.fn(async () => {
        calls.push('delete');
      }),
    });
    createMock.mockResolvedValueOnce(sandbox);

    const handle = await createVercelSandbox({}).createSession();
    await handle.destroy();

    expect(calls).toEqual(['stop', 'delete']);
    expect(spies.stop).toHaveBeenCalledTimes(1);
    expect(spies.delete).toHaveBeenCalledTimes(1);
  });

  it('destroy deletes owned sandboxes even when stop fails', async () => {
    const { sandbox, spies } = makeMockSandbox({
      stop: vi.fn(async () => {
        throw new Error('already stopped');
      }),
    });
    createMock.mockResolvedValueOnce(sandbox);

    const handle = await createVercelSandbox({}).createSession();
    await handle.destroy();

    expect(spies.stop).toHaveBeenCalledTimes(1);
    expect(spies.delete).toHaveBeenCalledTimes(1);
  });

  it('forwards credentials when resuming a named session', async () => {
    const { sandbox } = makeMockSandbox();
    getMock.mockResolvedValueOnce(sandbox);
    const abortController = new AbortController();

    await createVercelSandbox({
      token: 'token_test',
      teamId: 'team_test',
      projectId: 'prj_test',
    }).resumeSession?.({
      sessionId: 'session-123',
      abortSignal: abortController.signal,
    });

    expect(getMock).toHaveBeenCalledWith({
      name: 'ai-sdk-harness-session-session-123',
      token: 'token_test',
      teamId: 'team_test',
      projectId: 'prj_test',
      signal: abortController.signal,
    });
  });

  it('forwards credentials when polling for a template snapshot', async () => {
    const { sandbox: template } = makeMockSandbox({
      stop: vi.fn(async () => ({})),
    });
    const { sandbox: refreshedTemplate } = makeMockSandbox();
    const { sandbox: fork } = makeMockSandbox();
    Object.assign(template, { currentSnapshotId: undefined });
    Object.assign(refreshedTemplate, { currentSnapshotId: 'snap_123' });
    getOrCreateMock.mockResolvedValueOnce(template);
    getMock.mockResolvedValueOnce(refreshedTemplate);
    createMock.mockResolvedValueOnce(fork);
    const abortController = new AbortController();

    await createVercelSandbox({
      token: 'token_test',
      teamId: 'team_test',
      projectId: 'prj_test',
    }).createSession({
      identity: 'template-test',
      abortSignal: abortController.signal,
      onFirstCreate: async () => {},
    });

    expect(getMock).toHaveBeenCalledWith({
      name: 'ai-sdk-harness-template-test',
      resume: false,
      token: 'token_test',
      teamId: 'team_test',
      projectId: 'prj_test',
      signal: abortController.signal,
    });
  });
});

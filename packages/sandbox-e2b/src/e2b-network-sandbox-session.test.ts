import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import type { Sandbox } from 'e2b';
import { describe, expect, it, vi } from 'vitest';
import { E2BNetworkSandboxSession } from './e2b-network-sandbox-session';

function makeMockSandbox(overrides: Partial<Sandbox> = {}) {
  const pause = vi.fn(async () => true);
  const kill = vi.fn(async () => true);
  const getInfo = vi.fn(async () => ({}));
  const updateNetwork = vi.fn(async () => {});
  const getHost = vi.fn((port: number) => `${port}-sbx_test.e2b.app`);
  const sandbox = {
    sandboxId: 'sbx_test',
    getHost,
    pause,
    kill,
    getInfo,
    updateNetwork,
    ...overrides,
  } as unknown as Sandbox;
  return { sandbox, spies: { pause, kill, getInfo, updateNetwork, getHost } };
}

function makeSession(
  overrides: Partial<Sandbox> = {},
  ports: ReadonlyArray<number> = [4000],
) {
  const mock = makeMockSandbox(overrides);
  const session = new E2BNetworkSandboxSession({
    sandbox: mock.sandbox,
    defaultWorkingDirectory: '/home/user',
    ports,
  });
  return { session, ...mock };
}

describe('E2BNetworkSandboxSession', () => {
  it('exposes the sandbox ID, working directory, and ports', () => {
    const { session } = makeSession({}, [4000, 3000, 4000]);

    expect(session.id).toBe('sbx_test');
    expect(session.defaultWorkingDirectory).toBe('/home/user');
    expect(session.ports).toEqual([4000, 3000]);
  });

  it('lists no ports unless they are passed', () => {
    const { sandbox } = makeMockSandbox();

    expect(
      new E2BNetworkSandboxSession({
        sandbox,
        defaultWorkingDirectory: '/home/user',
      }).ports,
    ).toEqual([]);
  });

  it('rejects invalid ports', () => {
    const { sandbox } = makeMockSandbox();

    for (const port of [0, 65_536, 1.5, Number.NaN]) {
      expect(
        () =>
          new E2BNetworkSandboxSession({
            sandbox,
            defaultWorkingDirectory: '/home/user',
            ports: [port],
          }),
      ).toThrow('Invalid sandbox port');
    }
  });

  describe('getPortEndpoint', () => {
    it('returns a direct wss:// URL for the host that E2B resolves', async () => {
      const { session, spies } = makeSession();

      expect(
        await session.getPortEndpoint({ port: 4000, protocol: 'ws' }),
      ).toEqual({ url: 'wss://4000-sbx_test.e2b.app' });
      expect(spies.getHost).toHaveBeenCalledWith(4000);
    });

    it('maps the other protocols to https', async () => {
      const { session } = makeSession();

      for (const protocol of [undefined, 'http', 'https'] as const) {
        expect(await session.getPortEndpoint({ port: 4000, protocol })).toEqual(
          { url: 'https://4000-sbx_test.e2b.app' },
        );
      }
    });

    it('keeps the bridge token query intact when it is appended', async () => {
      const { session } = makeSession();
      const token = 'a/b+c&d=e?f#g h%';

      const { url } = await session.getPortEndpoint({
        port: 4000,
        protocol: 'ws',
      });
      const bridgeUrl = new URL(
        `${url}?agent_bridge_token=${encodeURIComponent(token)}`,
      );

      expect(bridgeUrl.host).toBe('4000-sbx_test.e2b.app');
      expect(bridgeUrl.searchParams.get('agent_bridge_token')).toBe(token);
    });

    it('returns the same URL on every call', async () => {
      const { session } = makeSession();

      const first = await session.getPortEndpoint({
        port: 4000,
        protocol: 'ws',
      });
      const second = await session.getPortEndpoint({
        port: 4000,
        protocol: 'ws',
      });

      expect(second).toEqual(first);
    });

    it('resolves ports that are not listed, because E2B routes every port', async () => {
      const { session } = makeSession({}, []);

      expect(await session.getPortEndpoint({ port: 8080 })).toEqual({
        url: 'https://8080-sbx_test.e2b.app',
      });
    });

    it('rejects an invalid port', async () => {
      const { session, spies } = makeSession();

      const result = session.getPortEndpoint({ port: 70_000 });

      await expect(result).rejects.toSatisfy(
        HarnessCapabilityUnsupportedError.isInstance,
      );
      expect(spies.getHost).not.toHaveBeenCalled();
    });

    it('adds the traffic access token header when public traffic is restricted', async () => {
      const { session } = makeSession({ trafficAccessToken: 'traffic-token' });

      expect(
        await session.getPortEndpoint({ port: 4000, protocol: 'ws' }),
      ).toEqual({
        url: 'wss://4000-sbx_test.e2b.app',
        headers: { 'e2b-traffic-access-token': 'traffic-token' },
      });
    });
  });

  it('resolves the deprecated getPortUrl to the endpoint URL', async () => {
    const { session } = makeSession({ trafficAccessToken: 'traffic-token' });

    expect(await session.getPortUrl({ port: 4000, protocol: 'ws' })).toBe(
      'wss://4000-sbx_test.e2b.app',
    );
  });

  it('restricts to the file and process surface', async () => {
    const { session } = makeSession();

    const restricted = session.restricted();

    expect(restricted.description).toContain('sbx_test');
    for (const method of [
      'stop',
      'destroy',
      'getPortEndpoint',
      'setNetworkPolicy',
    ]) {
      expect(method in restricted).toBe(false);
    }
  });

  it('pauses the sandbox on stop and tolerates a repeated stop', async () => {
    const { session, spies } = makeSession();
    // E2B reports an already paused sandbox by resolving `false`.
    spies.pause.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await session.stop();
    await session.stop();

    expect(spies.pause).toHaveBeenCalledTimes(2);
    expect(spies.kill).not.toHaveBeenCalled();
  });

  it('kills the sandbox on destroy, whether it is running or already gone', async () => {
    const { session, spies } = makeSession();
    // E2B reports a sandbox that no longer exists by resolving `false`.
    spies.kill.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await session.destroy();
    await session.destroy();

    expect(spies.kill).toHaveBeenCalledTimes(2);
    expect(spies.pause).not.toHaveBeenCalled();
  });

  it('sets the network policy through the E2B egress configuration', async () => {
    const { session, spies } = makeSession();

    await session.setNetworkPolicy({ mode: 'deny-all' });

    expect(spies.updateNetwork).toHaveBeenCalledExactlyOnceWith({
      allowInternetAccess: false,
    });
  });

  it('omits the capabilities that E2B cannot honour', () => {
    const { session } = makeSession();

    expect('setPorts' in session).toBe(false);
    expect('setRequestTransformations' in session).toBe(false);
    expect('addRequestTransformations' in session).toBe(false);
  });
});

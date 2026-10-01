import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { withBridgeToken } from '@ai-sdk/harness/utils';
import type { Sandbox } from 'modal';
import { describe, expect, it, vi } from 'vitest';
import { ModalNetworkSandboxSession } from './modal-network-sandbox-session';

const TUNNEL_URL = 'https://ta-01abc-4000-xyz.w.modal.host';

function makeMockSandbox(
  overrides: {
    tunnels?: ReturnType<typeof vi.fn>;
    terminate?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const tunnels =
    overrides.tunnels ?? vi.fn(async () => ({ 4000: { url: TUNNEL_URL } }));
  const terminate = overrides.terminate ?? vi.fn(async () => {});
  const detach = vi.fn();
  const sandbox = {
    sandboxId: 'sb-test',
    tunnels,
    terminate,
    detach,
  } as unknown as Sandbox;
  return { sandbox, spies: { tunnels, terminate, detach } };
}

function createSession(
  sandbox: Sandbox,
  overrides: { id?: string; ports?: number[] } = {},
) {
  return new ModalNetworkSandboxSession({
    sandbox,
    workingDirectory: '/workspace',
    ports: overrides.ports ?? [4000],
    id: overrides.id,
  });
}

describe('ModalNetworkSandboxSession', () => {
  describe('identity', () => {
    it('uses the Modal sandbox ID unless a name was assigned', () => {
      const { sandbox } = makeMockSandbox();
      expect(createSession(sandbox).id).toBe('sb-test');
      expect(createSession(sandbox, { id: 'my-session' }).id).toBe(
        'my-session',
      );
    });

    it('exposes the working directory and the ports in ascending order', () => {
      const { sandbox } = makeMockSandbox();
      const session = createSession(sandbox, { ports: [8080, 4000, 8080] });
      expect(session.defaultWorkingDirectory).toBe('/workspace');
      expect(session.ports).toEqual([4000, 8080]);
    });
  });

  describe('getPortEndpoint', () => {
    it('awaits the tunnels and returns a directly dialable wss URL', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const session = createSession(sandbox);

      expect(spies.tunnels).not.toHaveBeenCalled();
      expect(
        await session.getPortEndpoint({ port: 4000, protocol: 'ws' }),
      ).toEqual({ url: 'wss://ta-01abc-4000-xyz.w.modal.host/' });
      expect(spies.tunnels).toHaveBeenCalledOnce();
    });

    it('maps http and https to the tunnel https URL', async () => {
      const { sandbox } = makeMockSandbox();
      const session = createSession(sandbox);
      const expected = { url: 'https://ta-01abc-4000-xyz.w.modal.host/' };

      expect(await session.getPortEndpoint({ port: 4000 })).toEqual(expected);
      expect(
        await session.getPortEndpoint({ port: 4000, protocol: 'https' }),
      ).toEqual(expected);
      expect(
        await session.getPortEndpoint({ port: 4000, protocol: 'http' }),
      ).toEqual(expected);
    });

    it('keeps a non-default tunnel port in the URL', async () => {
      const { sandbox } = makeMockSandbox({
        tunnels: vi.fn(async () => ({
          4000: { url: 'https://tunnel.modal.host:8443' },
        })),
      });

      expect(
        await createSession(sandbox).getPortEndpoint({
          port: 4000,
          protocol: 'ws',
        }),
      ).toEqual({ url: 'wss://tunnel.modal.host:8443/' });
    });

    it('returns the same URL on every call', async () => {
      const { sandbox } = makeMockSandbox();
      const session = createSession(sandbox);

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

    it('carries the bridge token as a plain query parameter', async () => {
      const { sandbox } = makeMockSandbox();
      const token = 'tok/with+reserved&chars=';

      const endpoint = withBridgeToken({
        endpoint: await createSession(sandbox).getPortEndpoint({
          port: 4000,
          protocol: 'ws',
        }),
        token,
      });

      expect(endpoint).toEqual({
        url: `wss://ta-01abc-4000-xyz.w.modal.host/?agent_bridge_token=${encodeURIComponent(token)}`,
      });
    });

    it('rejects ports that the sandbox does not expose', async () => {
      const { sandbox, spies } = makeMockSandbox();

      const error = await createSession(sandbox)
        .getPortEndpoint({ port: 5000 })
        .catch(error => error);

      expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
      expect(error.message).toBe(
        'Port 5000 is not exposed on this sandbox. Exposed ports: [4000].',
      );
      expect(spies.tunnels).not.toHaveBeenCalled();
    });

    it('rejects ports that Modal has no tunnel for', async () => {
      const { sandbox } = makeMockSandbox({ tunnels: vi.fn(async () => ({})) });

      const error = await createSession(sandbox)
        .getPortEndpoint({ port: 4000 })
        .catch(error => error);

      expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
      expect(error.message).toContain('encryptedPorts: [4000]');
    });
  });

  describe('getPortUrl', () => {
    it('returns the endpoint URL', async () => {
      const { sandbox } = makeMockSandbox();

      expect(
        await createSession(sandbox).getPortUrl({ port: 4000, protocol: 'ws' }),
      ).toBe('wss://ta-01abc-4000-xyz.w.modal.host/');
    });
  });

  describe('restricted', () => {
    it('returns a session without the network and lifecycle surface', () => {
      const { sandbox } = makeMockSandbox();
      const restricted = createSession(sandbox).restricted();

      expect('stop' in restricted).toBe(false);
      expect('destroy' in restricted).toBe(false);
      expect('getPortEndpoint' in restricted).toBe(false);
      expect(restricted.description).toContain('sb-test');
    });
  });

  describe('lifecycle', () => {
    it('stop() terminates the sandbox once', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const session = createSession(sandbox);

      await session.stop();
      await session.stop();

      expect(spies.terminate).toHaveBeenCalledOnce();
      expect(spies.detach).toHaveBeenCalledOnce();
    });

    it('destroy() handles running and already stopped sandboxes', async () => {
      const running = makeMockSandbox();
      await createSession(running.sandbox).destroy();
      expect(running.spies.terminate).toHaveBeenCalledOnce();

      const stopped = makeMockSandbox();
      const session = createSession(stopped.sandbox);
      await session.stop();
      await session.destroy();
      expect(stopped.spies.terminate).toHaveBeenCalledOnce();
    });

    it('stop() can be retried after a failed termination', async () => {
      const failure = new Error('unavailable');
      const terminate = vi
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValueOnce(undefined);
      const { sandbox, spies } = makeMockSandbox({ terminate });
      const session = createSession(sandbox);

      await expect(session.stop()).rejects.toBe(failure);
      expect(spies.detach).not.toHaveBeenCalled();
      await session.stop();

      expect(terminate).toHaveBeenCalledTimes(2);
      expect(spies.detach).toHaveBeenCalledOnce();
    });
  });

  describe('optional capabilities', () => {
    it('omits network policy and port updates', () => {
      const { sandbox } = makeMockSandbox();
      const session = createSession(sandbox);

      expect('setNetworkPolicy' in session).toBe(false);
      expect('setPorts' in session).toBe(false);
      expect('addRequestTransformations' in session).toBe(false);
    });
  });
});

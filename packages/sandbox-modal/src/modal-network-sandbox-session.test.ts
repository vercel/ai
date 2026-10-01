import { HarnessCapabilityUnsupportedError } from '@ai-sdk/harness';
import { withBridgeToken } from '@ai-sdk/harness/utils';
import type { Image, ModalClient, Sandbox } from 'modal';
import { describe, expect, it, vi } from 'vitest';
import { ModalNetworkSandboxSession } from './modal-network-sandbox-session';

const TUNNEL_URL = 'https://ta-01abc-4000-xyz.w.modal.host';

function makeMockSandbox(
  overrides: {
    tunnels?: ReturnType<typeof vi.fn>;
    terminate?: ReturnType<typeof vi.fn>;
    snapshotFilesystem?: ReturnType<typeof vi.fn>;
    exitCode?: number | null;
  } = {},
) {
  const tunnels =
    overrides.tunnels ?? vi.fn(async () => ({ 4000: { url: TUNNEL_URL } }));
  const terminate = overrides.terminate ?? vi.fn(async () => 0);
  const detach = vi.fn();
  const updateNetworkPolicy = vi.fn(async () => {});
  const snapshotFilesystem = overrides.snapshotFilesystem ?? vi.fn();
  const poll = vi.fn(async () => overrides.exitCode ?? null);
  const sandbox = {
    sandboxId: 'sb-test',
    tunnels,
    terminate,
    detach,
    updateNetworkPolicy,
    snapshotFilesystem,
    poll,
  } as unknown as Sandbox;
  return {
    sandbox,
    spies: {
      tunnels,
      terminate,
      detach,
      updateNetworkPolicy,
      snapshotFilesystem,
      poll,
    },
  };
}

function makeStopSnapshotFixture() {
  const publish = vi.fn(async (_name: string) => {});
  const image = { imageId: 'im-stopped', publish } as unknown as Image;
  const fromName = vi.fn(async (_name: string) => image);
  const fromId = vi.fn(async (_imageId: string) => image);
  const deleteImage = vi.fn(async (_imageId: string) => {});
  const client = {
    images: { fromName, fromId, delete: deleteImage },
  } as unknown as ModalClient;
  return {
    image,
    stopSnapshot: { client, appName: 'my-app' },
    spies: { publish, fromName, fromId, deleteImage },
  };
}

function createSession(
  sandbox: Sandbox,
  overrides: {
    id?: string;
    ports?: number[];
    stopSnapshot?: { client: ModalClient; appName: string };
  } = {},
) {
  return new ModalNetworkSandboxSession({
    sandbox,
    workingDirectory: '/workspace',
    ports: overrides.ports ?? [4000],
    id: overrides.id,
    stopSnapshot: overrides.stopSnapshot,
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

  describe('lifecycle of an adapted native sandbox', () => {
    it('stop() terminates the sandbox once and waits for it to finish', async () => {
      const { sandbox, spies } = makeMockSandbox();
      const session = createSession(sandbox);

      await session.stop();
      await session.stop();

      expect(spies.terminate).toHaveBeenCalledExactlyOnceWith({ wait: true });
      expect(spies.detach).toHaveBeenCalledOnce();
      expect(spies.snapshotFilesystem).not.toHaveBeenCalled();
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
        .mockResolvedValueOnce(0);
      const { sandbox, spies } = makeMockSandbox({ terminate });
      const session = createSession(sandbox);

      await expect(session.stop()).rejects.toBe(failure);
      expect(spies.detach).not.toHaveBeenCalled();
      await session.stop();

      expect(terminate).toHaveBeenCalledTimes(2);
      expect(spies.detach).toHaveBeenCalledOnce();
    });
  });

  describe('lifecycle of a resumable sandbox', () => {
    it('stop() publishes a snapshot before it terminates the sandbox', async () => {
      const {
        image,
        stopSnapshot,
        spies: snapshotSpies,
      } = makeStopSnapshotFixture();
      const order: string[] = [];
      const { sandbox, spies } = makeMockSandbox({
        snapshotFilesystem: vi.fn(async () => {
          order.push('snapshot');
          return image;
        }),
        terminate: vi.fn(async () => {
          order.push('terminate');
          return 0;
        }),
      });
      snapshotSpies.publish.mockImplementation(async () => {
        order.push('publish');
      });
      const session = createSession(sandbox, {
        id: 'live-session',
        stopSnapshot,
      });

      await session.stop();
      await session.stop();

      expect(order).toEqual(['snapshot', 'publish', 'terminate']);
      expect(snapshotSpies.publish).toHaveBeenCalledExactlyOnceWith(
        expect.stringMatching(/^ai-sdk-sandbox-stopped-[a-f0-9]{24}$/),
      );
      expect(spies.terminate).toHaveBeenCalledExactlyOnceWith({ wait: true });
      expect(snapshotSpies.deleteImage).not.toHaveBeenCalled();
    });

    it('stop() keeps the sandbox running when the snapshot fails', async () => {
      const { stopSnapshot } = makeStopSnapshotFixture();
      const failure = new Error('snapshot timed out');
      const { sandbox, spies } = makeMockSandbox({
        snapshotFilesystem: vi.fn().mockRejectedValue(failure),
      });
      const session = createSession(sandbox, { stopSnapshot });

      await expect(session.stop()).rejects.toBe(failure);

      expect(spies.terminate).not.toHaveBeenCalled();
    });

    it('stop() succeeds for a sandbox that has already finished', async () => {
      const { stopSnapshot, spies: snapshotSpies } = makeStopSnapshotFixture();
      const { sandbox, spies } = makeMockSandbox({
        snapshotFilesystem: vi
          .fn()
          .mockRejectedValue(
            Object.assign(new Error('failed precondition'), { code: 9 }),
          ),
        exitCode: 137,
      });
      const session = createSession(sandbox, { stopSnapshot });

      await session.stop();

      expect(snapshotSpies.publish).not.toHaveBeenCalled();
      expect(spies.terminate).toHaveBeenCalledOnce();
    });

    it('destroy() terminates without a snapshot and deletes the stop snapshot', async () => {
      const { stopSnapshot, spies: snapshotSpies } = makeStopSnapshotFixture();
      const { sandbox, spies } = makeMockSandbox();
      const session = createSession(sandbox, {
        id: 'live-session',
        stopSnapshot,
      });

      await session.destroy();

      expect(spies.snapshotFilesystem).not.toHaveBeenCalled();
      expect(spies.terminate).toHaveBeenCalledExactlyOnceWith({ wait: true });
      expect(snapshotSpies.deleteImage).toHaveBeenCalledExactlyOnceWith(
        'im-stopped',
      );
    });

    it('destroy() after stop() deletes the snapshot that stop() published', async () => {
      const {
        image,
        stopSnapshot,
        spies: snapshotSpies,
      } = makeStopSnapshotFixture();
      const { sandbox, spies } = makeMockSandbox({
        snapshotFilesystem: vi.fn(async () => image),
      });
      const session = createSession(sandbox, {
        id: 'live-session',
        stopSnapshot,
      });

      await session.stop();
      await session.destroy();

      expect(spies.terminate).toHaveBeenCalledOnce();
      expect(snapshotSpies.fromName).toHaveBeenCalledWith(
        snapshotSpies.publish.mock.calls[0][0],
      );
      expect(snapshotSpies.deleteImage).toHaveBeenCalledExactlyOnceWith(
        'im-stopped',
      );
    });
  });

  describe('setNetworkPolicy', () => {
    it('replaces the outbound allowlists of the running sandbox', async () => {
      const { sandbox, spies } = makeMockSandbox();

      await createSession(sandbox).setNetworkPolicy({
        mode: 'custom',
        allowedHosts: ['example.com'],
        allowedCIDRs: ['10.0.0.0/8'],
      });

      expect(spies.updateNetworkPolicy).toHaveBeenCalledExactlyOnceWith({
        outboundCidrAllowlist: ['10.0.0.0/8'],
        outboundDomainAllowlist: ['example.com'],
      });
    });

    it('rejects a deny list without calling Modal', async () => {
      const { sandbox, spies } = makeMockSandbox();

      const error = await createSession(sandbox)
        .setNetworkPolicy({
          mode: 'custom',
          allowedCIDRs: ['10.0.0.0/8'],
          deniedCIDRs: ['10.1.0.0/16'],
        })
        .catch(error => error);

      expect(HarnessCapabilityUnsupportedError.isInstance(error)).toBe(true);
      expect(spies.updateNetworkPolicy).not.toHaveBeenCalled();
    });
  });

  describe('optional capabilities', () => {
    it('omits port updates and request transformations', () => {
      const { sandbox } = makeMockSandbox();
      const session = createSession(sandbox);

      expect('setPorts' in session).toBe(false);
      expect('setRequestTransformations' in session).toBe(false);
      expect('addRequestTransformations' in session).toBe(false);
    });

    it('keeps network policy off the restricted session', () => {
      const { sandbox } = makeMockSandbox();

      expect('setNetworkPolicy' in createSession(sandbox).restricted()).toBe(
        false,
      );
    });
  });
});

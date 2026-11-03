import { describe, expect, it, vi } from 'vitest';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type { HarnessV1NetworkSandboxSession } from '../v1';
import {
  resolveBridgeEndpoint,
  resolveBridgePort,
  validateBridgeSandboxSettings,
} from './bridge-endpoint';

function createNetworkSandboxSession({
  ports = [4000],
}: {
  ports?: number[];
} = {}): HarnessV1NetworkSandboxSession {
  return {
    id: 'sandbox-1',
    ports,
    getPortEndpoint: vi.fn(async ({ port }: { port: number }) => ({
      url: `wss://sandbox.example/${port}`,
      headers: { 'x-access-token': 'traffic-token' },
    })),
  } as unknown as HarnessV1NetworkSandboxSession;
}

const basicSandboxSession = {} as unknown as HarnessV1NetworkSandboxSession;

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected function to throw.');
}

describe('validateBridgeSandboxSettings', () => {
  it('accepts a network sandbox session without settings', () => {
    expect(() =>
      validateBridgeSandboxSettings({
        sandboxSession: createNetworkSandboxSession(),
        sandboxId: 'sandbox-1',
        portOverride: undefined,
        portEndpointOverride: undefined,
        mintBridgeToken: undefined,
      }),
    ).not.toThrow();
  });

  it('requires a port setting for a basic sandbox session', () => {
    const error = captureError(() =>
      validateBridgeSandboxSettings({
        sandboxSession: basicSandboxSession,
        sandboxId: undefined,
        portOverride: undefined,
        portEndpointOverride: { url: 'wss://example' },
        mintBridgeToken: undefined,
      }),
    );

    expect(error).toBeInstanceOf(HarnessCapabilityUnsupportedError);
    expect((error as Error).message).toMatchInlineSnapshot(
      `"The harness requires an explicit \`port\` setting when using a basic sandbox session."`,
    );
  });

  it('requires a portEndpoint setting for a basic sandbox session', () => {
    const error = captureError(() =>
      validateBridgeSandboxSettings({
        sandboxSession: basicSandboxSession,
        sandboxId: undefined,
        portOverride: 4000,
        portEndpointOverride: undefined,
        mintBridgeToken: undefined,
      }),
    );

    expect((error as Error).message).toMatchInlineSnapshot(
      `"The harness requires an explicit \`portEndpoint\` setting when using a basic sandbox session."`,
    );
  });

  it('requires a sandbox id when mintBridgeToken is set', () => {
    const error = captureError(() =>
      validateBridgeSandboxSettings({
        sandboxSession: basicSandboxSession,
        sandboxId: undefined,
        portOverride: 4000,
        portEndpointOverride: { url: 'wss://example' },
        mintBridgeToken: () => 'token',
      }),
    );

    expect(error).toBeInstanceOf(HarnessCapabilityUnsupportedError);
    expect((error as Error).message).toMatchInlineSnapshot(
      `"The harness cannot use \`mintBridgeToken\` with a sandbox session that does not expose an id."`,
    );
  });
});

describe('resolveBridgePort', () => {
  it('prefers the port setting', () => {
    expect(
      resolveBridgePort({
        sandboxSession: createNetworkSandboxSession(),
        portOverride: 5000,
      }),
    ).toBe(5000);
  });

  it('falls back to the first sandbox port', () => {
    expect(
      resolveBridgePort({
        sandboxSession: createNetworkSandboxSession({ ports: [4100, 4200] }),
        portOverride: undefined,
      }),
    ).toBe(4100);
  });

  it('throws when no port is available', () => {
    const error = captureError(() =>
      resolveBridgePort({
        sandboxSession: createNetworkSandboxSession({ ports: [] }),
        portOverride: undefined,
      }),
    );

    expect(error).toBeInstanceOf(HarnessCapabilityUnsupportedError);
    expect((error as Error).message).toMatchInlineSnapshot(
      `"The harness needs a TCP port exposed by the sandbox. Create the sandbox with \`ports: [<port>]\` or configure the harness \`port\` setting."`,
    );
  });
});

describe('resolveBridgeEndpoint', () => {
  it('resolves the sandbox endpoint and applies the bridge token', async () => {
    const sandboxSession = createNetworkSandboxSession();

    await expect(
      resolveBridgeEndpoint({
        sandboxSession,
        port: 4321,
        portEndpointOverride: undefined,
        token: 'bridge-token',
      }),
    ).resolves.toEqual({
      url: 'wss://sandbox.example/4321?agent_bridge_token=bridge-token',
      headers: { 'x-access-token': 'traffic-token' },
    });
    expect(sandboxSession.getPortEndpoint).toHaveBeenCalledWith({
      port: 4321,
      protocol: 'ws',
    });
  });

  it('prefers the portEndpoint setting and keeps its query parameters', async () => {
    const sandboxSession = createNetworkSandboxSession();

    await expect(
      resolveBridgeEndpoint({
        sandboxSession,
        port: 4321,
        portEndpointOverride: { url: 'wss://custom.example/bridge?a=b' },
        token: 'bridge-token',
      }),
    ).resolves.toEqual({
      url: 'wss://custom.example/bridge?a=b&agent_bridge_token=bridge-token',
    });
    expect(sandboxSession.getPortEndpoint).not.toHaveBeenCalled();
  });

  it('throws for a basic sandbox session without a portEndpoint setting', async () => {
    await expect(
      resolveBridgeEndpoint({
        sandboxSession: basicSandboxSession,
        port: 4321,
        portEndpointOverride: undefined,
        token: 'bridge-token',
      }),
    ).rejects.toThrow(
      'The harness requires an explicit `portEndpoint` setting when using a basic sandbox session.',
    );
  });
});

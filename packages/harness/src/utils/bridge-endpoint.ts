import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type {
  HarnessV1MintBridgeTokenCallback,
  HarnessV1NetworkSandboxSession,
  HarnessV1PortEndpoint,
} from '../v1';
import { withBridgeToken } from './bridge-token';

/**
 * Validates the bridge connection settings against the sandbox session before
 * any bridge work starts.
 *
 * Basic sandbox sessions cannot expose ports, so they need both an explicit
 * `port` and `portEndpoint` setting. A custom `mintBridgeToken` callback needs
 * a sandbox id to mint the token for.
 */
export function validateBridgeSandboxSettings({
  sandboxSession,
  sandboxId,
  portOverride,
  portEndpointOverride,
  mintBridgeToken,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  sandboxId: string | undefined;
  portOverride: number | undefined;
  portEndpointOverride: HarnessV1PortEndpoint | undefined;
  mintBridgeToken: HarnessV1MintBridgeTokenCallback | undefined;
}): void {
  if (!('getPortEndpoint' in sandboxSession)) {
    if (portOverride == null) {
      throw new HarnessCapabilityUnsupportedError({
        message:
          'The harness requires an explicit `port` setting when using a basic sandbox session.',
      });
    }
    if (portEndpointOverride == null) {
      throw createMissingPortEndpointError();
    }
  }
  if (mintBridgeToken != null && sandboxId == null) {
    throw new HarnessCapabilityUnsupportedError({
      message:
        'The harness cannot use `mintBridgeToken` with a sandbox session that does not expose an id.',
    });
  }
}

/**
 * Resolves the port the bridge listens on inside the sandbox: the `port`
 * setting if present, otherwise the first port the sandbox exposes.
 */
export function resolveBridgePort({
  sandboxSession,
  portOverride,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  portOverride: number | undefined;
}): number {
  if (portOverride !== undefined) return portOverride;
  if ('ports' in sandboxSession && sandboxSession.ports.length > 0) {
    return sandboxSession.ports[0];
  }
  throw new HarnessCapabilityUnsupportedError({
    message:
      'The harness needs a TCP port exposed by the sandbox. ' +
      'Create the sandbox with `ports: [<port>]` or configure the harness `port` setting.',
  });
}

/**
 * Resolves the host-reachable WebSocket endpoint for a bridge port and
 * authenticates it with the bridge token.
 *
 * A `portEndpoint` setting takes precedence and is used as-is regardless of
 * `port`, so it must point at the port the bridge actually listens on.
 */
export async function resolveBridgeEndpoint({
  sandboxSession,
  port,
  portEndpointOverride,
  token,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  port: number;
  portEndpointOverride: HarnessV1PortEndpoint | undefined;
  token: string;
}): Promise<HarnessV1PortEndpoint> {
  let endpoint: HarnessV1PortEndpoint;
  if (portEndpointOverride != null) {
    endpoint = portEndpointOverride;
  } else if ('getPortEndpoint' in sandboxSession) {
    endpoint = await sandboxSession.getPortEndpoint({ port, protocol: 'ws' });
  } else {
    throw createMissingPortEndpointError();
  }
  return withBridgeToken({ endpoint, token });
}

function createMissingPortEndpointError(): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    message:
      'The harness requires an explicit `portEndpoint` setting when using a basic sandbox session.',
  });
}

import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import { HarnessCapabilityUnsupportedError } from '../errors/harness-capability-unsupported-error';
import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1PortEndpoint,
} from '../v1';

/**
 * Validates the bridge connection settings against the sandbox session before
 * any bridge work starts.
 *
 * Basic sandbox sessions cannot expose ports, so they need both an explicit
 * `port` and `portEndpoint` setting.
 */
export function validateBridgeSandboxSettings({
  sandboxSession,
  portOverride,
  portEndpointOverride,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  portOverride: number | undefined;
  portEndpointOverride: HarnessV1PortEndpoint | undefined;
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
}

// TODO: Remove in the next major version.
/**
 * Warns that a passed `mintBridgeToken` setting is ignored. Sandbox bridge
 * authentication uses an adapter-generated Ed25519 key pair instead of a
 * shared token.
 */
export function warnMintBridgeTokenIgnored({
  harnessId,
  mintBridgeToken,
}: {
  harnessId: string;
  mintBridgeToken: unknown;
}): void {
  if (mintBridgeToken == null) return;
  console.warn(
    `The ${harnessId} harness ignores the deprecated \`mintBridgeToken\` setting. Sandbox bridge authentication now uses an adapter-generated key pair.`,
  );
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
 * Resolves the host-reachable WebSocket endpoint for a bridge port.
 *
 * A `portEndpoint` setting takes precedence and is used as-is regardless of
 * `port`, so it must point at the port the bridge actually listens on.
 */
export async function resolveBridgeEndpoint({
  sandboxSession,
  port,
  portEndpointOverride,
}: {
  sandboxSession: HarnessV1NetworkSandboxSession | SandboxSession;
  port: number;
  portEndpointOverride: HarnessV1PortEndpoint | undefined;
}): Promise<HarnessV1PortEndpoint> {
  if (portEndpointOverride != null) {
    return portEndpointOverride;
  }
  if ('getPortEndpoint' in sandboxSession) {
    return sandboxSession.getPortEndpoint({ port, protocol: 'ws' });
  }
  throw createMissingPortEndpointError();
}

function createMissingPortEndpointError(): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    message:
      'The harness requires an explicit `portEndpoint` setting when using a basic sandbox session.',
  });
}

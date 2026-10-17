import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { Sandbox } from 'e2b';
import { setE2BNetworkPolicy } from './e2b-network-policy';
import { E2BSandboxSession } from './e2b-sandbox-session';
import { E2B_PROVIDER_ID, isValidPort, normalizePorts } from './utils';

/**
 * Header that E2B requires on requests to a sandbox created with
 * `network.allowPublicTraffic: false`.
 */
const TRAFFIC_ACCESS_TOKEN_HEADER = 'e2b-traffic-access-token';

/**
 * `HarnessV1NetworkSandboxSession` backed by an `e2b` `Sandbox`. The native
 * adaptation and sandbox creation functions return one of these. It extends
 * {@link E2BSandboxSession} with ports, lifecycle, and network policy.
 *
 * `stop()` pauses the sandbox, which keeps its filesystem and memory until it
 * is resumed or destroyed. `destroy()` kills it.
 *
 * E2B routes every port of a sandbox without registering it, so `setPorts` is
 * omitted and `ports` is the list the session was created with.
 */
export class E2BNetworkSandboxSession
  extends E2BSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  readonly ports: ReadonlyArray<number>;

  constructor(input: {
    sandbox: Sandbox;
    defaultWorkingDirectory: string;
    ports?: ReadonlyArray<number>;
  }) {
    super(input.sandbox, input.defaultWorkingDirectory);
    this.id = input.sandbox.sandboxId;
    this.defaultWorkingDirectory = input.defaultWorkingDirectory;
    this.ports = normalizePorts(input.ports);
  }

  restricted(): SandboxSession {
    return new E2BSandboxSession(this.sandbox, this.defaultWorkingDirectory);
  }

  getPortEndpoint = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<HarnessV1PortEndpoint> => {
    if (!isValidPort(options.port)) {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: E2B_PROVIDER_ID,
        message: `Port ${options.port} is not a valid sandbox port.`,
      });
    }
    // E2B terminates TLS at its edge, so every protocol maps to its secure
    // scheme.
    const scheme = options.protocol === 'ws' ? 'wss' : 'https';
    const url = `${scheme}://${this.sandbox.getHost(options.port)}`;
    const { trafficAccessToken } = this.sandbox;
    return trafficAccessToken == null
      ? { url }
      : { url, headers: { [TRAFFIC_ACCESS_TOKEN_HEADER]: trafficAccessToken } };
  };

  /**
   * @deprecated Use `getPortEndpoint` instead.
   */
  getPortUrl = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<string> => {
    return (await this.getPortEndpoint(options)).url;
  };

  setNetworkPolicy = async (policy: HarnessV1NetworkPolicy): Promise<void> => {
    await setE2BNetworkPolicy({ sandbox: this.sandbox, policy });
  };

  stop = async (): Promise<void> => {
    await this.sandbox.pause();
  };

  destroy = async (): Promise<void> => {
    await this.sandbox.kill();
  };
}

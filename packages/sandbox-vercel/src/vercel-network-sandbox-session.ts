import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { Sandbox } from '@vercel/sandbox';
import { VercelNetworkPolicyManager } from './vercel-network-policy-manager';
import { VercelSandboxSession } from './vercel-sandbox-session';

const VERCEL_PROVIDER_ID = 'vercel-sandbox';

/**
 * `HarnessV1NetworkSandboxSession` backed by a `@vercel/sandbox` `Sandbox`. The
 * native adaptation and sandbox creation functions return one of these. It
 * extends {@link VercelSandboxSession} with ports, lifecycle, and network
 * policy. Explicit `stop()` and `destroy()` calls delegate to the native
 * sandbox unless the session was wrapped through the compatibility provider's
 * existing-sandbox path, where those calls are intentionally no-ops.
 */
export class VercelNetworkSandboxSession
  extends VercelSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  private readonly ownsLifecycle: boolean;
  readonly #networkPolicyManager: VercelNetworkPolicyManager;

  constructor(input: { sandbox: Sandbox; ownsLifecycle: boolean }) {
    super(input.sandbox);
    this.ownsLifecycle = input.ownsLifecycle;
    this.id = input.sandbox.name;
    this.defaultWorkingDirectory = input.sandbox.currentSession().cwd;
    this.#networkPolicyManager = new VercelNetworkPolicyManager({
      sandbox: input.sandbox,
    });
  }

  get ports(): ReadonlyArray<number> {
    return this.sandbox.routes.map(route => route.port);
  }

  restricted(): SandboxSession {
    return new VercelSandboxSession(this.sandbox);
  }

  getPortEndpoint = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<HarnessV1PortEndpoint> => {
    const exposedPorts = this.ports;
    if (!exposedPorts.includes(options.port)) {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: VERCEL_PROVIDER_ID,
        message: `Port ${options.port} is not exposed on this sandbox. Exposed ports: [${exposedPorts.join(', ')}].`,
      });
    }
    const protocol = options.protocol ?? 'https';
    const url = new URL(this.sandbox.domain(options.port));
    const isSecure = url.protocol === 'https:';
    switch (protocol) {
      case 'http':
        url.protocol = isSecure ? 'https:' : 'http:';
        break;
      case 'https':
        url.protocol = 'https:';
        break;
      case 'ws':
        url.protocol = isSecure ? 'wss:' : 'ws:';
        break;
    }
    return { url: url.toString() };
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
    await this.#networkPolicyManager.setNetworkPolicy(policy);
  };

  setRequestTransformations = async (
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> => {
    await this.#networkPolicyManager.setRequestTransformations(transformations);
  };

  addRequestTransformations = async (
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ): Promise<void> => {
    await this.#networkPolicyManager.addRequestTransformations(transformations);
  };

  setPorts = async (
    ports: ReadonlyArray<number>,
    options?: { abortSignal?: AbortSignal },
  ): Promise<void> => {
    await this.sandbox.update(
      { ports: [...ports] },
      options?.abortSignal ? { signal: options.abortSignal } : undefined,
    );
  };

  stop = async (): Promise<void> => {
    if (!this.ownsLifecycle) return;
    await this.sandbox.stop();
  };

  destroy = async (): Promise<void> => {
    if (!this.ownsLifecycle) return;
    await this.sandbox.stop().catch(() => {});
    await this.sandbox.delete();
  };
}

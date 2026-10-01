import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { Sandbox } from 'modal';
import { ModalSandboxSession } from './modal-sandbox-session';
import { MODAL_PROVIDER_ID, normalizePorts } from './utils';

/**
 * `HarnessV1NetworkSandboxSession` backed by a `modal` `Sandbox`. The native
 * adaptation and sandbox creation functions return one of these. It extends
 * {@link ModalSandboxSession} with ports and lifecycle. Explicit `stop()` and
 * `destroy()` calls terminate the native sandbox.
 *
 * Modal fixes a sandbox's tunnels and outbound network policy when the
 * sandbox is created, so `setPorts` and `setNetworkPolicy` are omitted.
 */
export class ModalNetworkSandboxSession
  extends ModalSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  readonly ports: ReadonlyArray<number>;
  private stopped: Promise<void> | undefined;

  constructor(input: {
    sandbox: Sandbox;
    workingDirectory: string;
    ports: ReadonlyArray<number>;
    /**
     * The sandbox name when one was assigned at creation. Defaults to the
     * sandbox ID that Modal assigned.
     */
    id?: string;
  }) {
    super(input.sandbox, input.workingDirectory);
    this.id = input.id ?? input.sandbox.sandboxId;
    this.defaultWorkingDirectory = input.workingDirectory;
    this.ports = normalizePorts(input.ports);
  }

  restricted(): SandboxSession {
    return new ModalSandboxSession(this.sandbox, this.workingDirectory);
  }

  getPortEndpoint = async (options: {
    port: number;
    protocol?: 'http' | 'https' | 'ws';
  }): Promise<HarnessV1PortEndpoint> => {
    if (!this.ports.includes(options.port)) {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: MODAL_PROVIDER_ID,
        message: `Port ${options.port} is not exposed on this sandbox. Exposed ports: [${this.ports.join(', ')}].`,
      });
    }
    // Modal assigns tunnel hosts when the sandbox starts, so they can only be
    // read from the running sandbox.
    const tunnel = (await this.sandbox.tunnels())[options.port];
    if (tunnel == null) {
      throw new HarnessCapabilityUnsupportedError({
        harnessId: MODAL_PROVIDER_ID,
        message: `Modal reported no tunnel for port ${options.port}. Create the sandbox with \`encryptedPorts: [${options.port}]\`.`,
      });
    }
    // Encrypted tunnels terminate TLS at Modal, so every protocol maps to its
    // secure scheme.
    const url = new URL(tunnel.url);
    url.protocol = options.protocol === 'ws' ? 'wss:' : 'https:';
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

  stop = async (): Promise<void> => {
    // The detached handle rejects further calls, so a repeated stop reuses
    // the first termination instead of calling Modal again.
    if (this.stopped == null) {
      this.stopped = this.sandbox.terminate().then(
        () => this.sandbox.detach(),
        error => {
          this.stopped = undefined;
          throw error;
        },
      );
    }
    await this.stopped;
  };

  destroy = async (): Promise<void> => {
    await this.stop();
  };
}

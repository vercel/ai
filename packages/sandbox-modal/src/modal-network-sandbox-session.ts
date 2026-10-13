import {
  HarnessCapabilityUnsupportedError,
  type HarnessV1NetworkPolicy,
  type HarnessV1NetworkSandboxSession,
  type HarnessV1PortEndpoint,
  type HarnessV1RequestTransformation,
} from '@ai-sdk/harness';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type { Sandbox } from 'modal';
import { setModalNetworkPolicy } from './modal-network-policy';
import { ModalRequestTransformationManager } from './modal-request-transformations';
import { ModalSandboxSession } from './modal-sandbox-session';
import {
  deleteStopSnapshot,
  publishStopSnapshot,
  type ModalStopSnapshotContext,
} from './modal-stop-snapshot';
import { MODAL_PROVIDER_ID, normalizePorts } from './utils';

/**
 * `HarnessV1NetworkSandboxSession` backed by a `modal` `Sandbox`. The native
 * adaptation and sandbox creation functions return one of these. It extends
 * {@link ModalSandboxSession} with ports, lifecycle, and network policy.
 *
 * Modal cannot restart a terminated sandbox. A session that was created or
 * resumed by this package therefore publishes a filesystem snapshot on
 * `stop()`, which `resumeModalNetworkSandboxSession()` starts a new sandbox
 * from. A session adapted from a native sandbox only terminates it.
 *
 * Modal fixes a sandbox's tunnels when the sandbox is created, so `setPorts`
 * is omitted.
 *
 * Modal only transforms the requests of a sandbox that was created with its
 * outbound policy, so `setRequestTransformations` and
 * `addRequestTransformations` exist only on the sessions of such sandboxes.
 * Harness adapters broker credentials when the methods exist and forward
 * credentials into the sandbox when they do not.
 */
export class ModalNetworkSandboxSession
  extends ModalSandboxSession
  implements HarnessV1NetworkSandboxSession
{
  readonly id: string;
  readonly defaultWorkingDirectory: string;
  readonly ports: ReadonlyArray<number>;
  readonly setRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ) => Promise<void>;
  readonly addRequestTransformations?: (
    transformations: ReadonlyArray<HarnessV1RequestTransformation>,
  ) => Promise<void>;
  private readonly requestTransformations: boolean;
  private readonly stopSnapshot: ModalStopSnapshotContext | undefined;
  private stopped: Promise<void> | undefined;
  private terminated: Promise<void> | undefined;

  constructor(input: {
    sandbox: Sandbox;
    workingDirectory: string;
    ports: ReadonlyArray<number>;
    /**
     * The sandbox name when one was assigned at creation. Defaults to the
     * sandbox ID that Modal assigned.
     */
    id?: string;
    /**
     * Present for sessions that keep a stopped sandbox resumable.
     */
    stopSnapshot?: ModalStopSnapshotContext;
    /**
     * Whether the sandbox was created with Modal's outbound policy.
     */
    requestTransformations?: boolean;
  }) {
    super(input.sandbox, input.workingDirectory);
    this.id = input.id ?? input.sandbox.sandboxId;
    this.defaultWorkingDirectory = input.workingDirectory;
    this.ports = normalizePorts(input.ports);
    this.stopSnapshot = input.stopSnapshot;
    this.requestTransformations = input.requestTransformations === true;
    if (this.requestTransformations) {
      const requestTransformationManager =
        new ModalRequestTransformationManager({ sandbox: input.sandbox });
      this.setRequestTransformations = transformations =>
        requestTransformationManager.setRequestTransformations(transformations);
      this.addRequestTransformations = transformations =>
        requestTransformationManager.addRequestTransformations(transformations);
    }
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

  setNetworkPolicy = async (policy: HarnessV1NetworkPolicy): Promise<void> => {
    if (this.requestTransformations) {
      // Modal accepts the update on some of these sandboxes without applying
      // it to their HTTPS traffic, so the call is refused instead.
      throw new HarnessCapabilityUnsupportedError({
        harnessId: MODAL_PROVIDER_ID,
        message:
          'Modal does not restrict the outbound HTTPS traffic of a sandbox that uses its outbound policy, so the network policy of a sandbox created with `requestTransformations: true` cannot be changed.',
      });
    }
    await setModalNetworkPolicy({ sandbox: this.sandbox, policy });
  };

  stop = async (): Promise<void> => {
    if (this.stopped == null) {
      this.stopped = this.snapshotAndTerminate().catch(error => {
        this.stopped = undefined;
        throw error;
      });
    }
    await this.stopped;
  };

  destroy = async (): Promise<void> => {
    await this.terminate();
    if (this.stopSnapshot != null) {
      await deleteStopSnapshot({ ...this.stopSnapshot, sandboxId: this.id });
    }
  };

  private async snapshotAndTerminate(): Promise<void> {
    if (this.stopSnapshot != null && this.terminated == null) {
      await publishStopSnapshot({
        sandbox: this.sandbox,
        appName: this.stopSnapshot.appName,
        sandboxId: this.id,
      });
    }
    await this.terminate();
  }

  private terminate(): Promise<void> {
    // The detached handle rejects further calls, so a repeated stop or
    // destroy reuses the first termination instead of calling Modal again.
    if (this.terminated == null) {
      // Waiting for the sandbox to finish releases its name, which a sandbox
      // restored from the stop snapshot takes over.
      this.terminated = this.sandbox.terminate({ wait: true }).then(
        () => this.sandbox.detach(),
        error => {
          this.terminated = undefined;
          throw error;
        },
      );
    }
    return this.terminated;
  }
}

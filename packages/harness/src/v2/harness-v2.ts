import type { ToolSet } from '@ai-sdk/provider-utils';
import type { HarnessV2Bootstrap } from './harness-v2-bootstrap';
import type { HarnessV2DriveContext } from './harness-v2-drive-context';

/**
 * Contract implemented by an adapter that can drive a HarnessAgent session.
 *
 * An adapter receives the SDK-provided drive context and reports its activity
 * through that context. Bootstrap is optional because some adapters need no
 * files or setup commands before driving a session.
 */
export type HarnessV2<TBuiltinTools extends ToolSet = ToolSet> = {
  /**
   * Identifies this contract version for runtime compatibility checks.
   */
  readonly specificationVersion: 'harness-v2';

  /**
   * Stable adapter identifier used for configuration and diagnostics.
   */
  readonly harnessId: string;

  /**
   * Tools implemented natively by the adapter rather than by the host.
   */
  readonly builtinTools: TBuiltinTools;

  /**
   * Returns files and commands required to prepare a sandbox for this adapter.
   */
  getBootstrap?(options: {
    abortSignal?: AbortSignal;
  }): PromiseLike<HarnessV2Bootstrap>;

  /**
   * Drives one session using the host-provided effects, tools, streams, and
   * cancellation signals.
   */
  drive(options: {
    sessionId: string;
    context: HarnessV2DriveContext;
  }): PromiseLike<void>;
};

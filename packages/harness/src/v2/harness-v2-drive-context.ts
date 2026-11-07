import type { SerializableValue } from '@ai-sdk/provider';
import type { Experimental_SandboxSession as SandboxSession } from '@ai-sdk/provider-utils';
import type {
  HarnessV2Effect,
  HarnessV2EffectContext,
  HarnessV2EffectOutput,
} from './harness-v2-effect';
import type { HarnessV2Log } from './harness-v2-log';
import type { HarnessV2NetworkSandboxSession } from './harness-v2-network-sandbox-session';
import type { HarnessV2StreamPart } from './harness-v2-stream-part';

/**
 * Host-provided function that runs a keyed effect under its replay policy and
 * records its output. Terminal outputs are replayed; retryable interruptions
 * permit another attempt. Callback failures become error outputs, while
 * serialization and persistence failures reject the call.
 */
export type HarnessV2EffectFunction = <
  T extends SerializableValue = SerializableValue,
>(
  key: string,
  options: Pick<HarnessV2Effect, 'name' | 'replay' | 'input'> &
    Partial<Pick<HarnessV2Effect, 'deliveredSubmissionIds'>>,
  fn: (context: HarnessV2EffectContext) => PromiseLike<T> | AsyncIterable<T>,
) => Promise<HarnessV2EffectOutput<T>>;

/**
 * Result of executing a tool through the host, including non-result outcomes.
 */
export type HarnessV2ToolExecutionOutput<
  T extends SerializableValue = SerializableValue,
> =
  | HarnessV2EffectOutput<T>
  | {
      /**
       * The host denied execution before the tool completed.
       */
      readonly type: 'denied';

      /**
       * Explanation supplied for the denial.
       */
      readonly reason: string;
    }
  | {
      /**
       * Execution is suspended pending an external action.
       */
      readonly type: 'suspended';

      /**
       * Whether approval or a client-side tool call is required to resume.
       */
      readonly reason: 'approval' | 'client-tool';
    };

/**
 * Outcome of gating a built-in tool before or during its execution.
 */
export type HarnessV2ToolGateOutput =
  | {
      /**
       * The host approved the tool call and provides its completion callback.
       */
      readonly type: 'approved';

      /**
       * Completes an approved call with its result, error, or interruption.
       */
      end(
        output: Exclude<
          HarnessV2ToolExecutionOutput,
          { readonly type: 'suspended' }
        >,
      ): Promise<void>;
    }
  | {
      /**
       * The host denied the tool call.
       */
      readonly type: 'denied';

      /**
       * Explanation supplied for the denial.
       */
      readonly reason: string;
    }
  | {
      /**
       * The call is waiting for approval outside the current drive.
       */
      readonly type: 'suspended';

      /**
       * The suspended gate is awaiting an approval decision.
       */
      readonly reason: 'approval';
    };

/**
 * Host capabilities exposed to a harness while it drives a session.
 */
export interface HarnessV2DriveContext {
  /**
   * Durable log used to read prior submissions and record harness events.
   */
  log: HarnessV2Log;

  /**
   * Runs a keyed effect under the supplied replay policy and records its output.
   */
  effect: HarnessV2EffectFunction;

  /**
   * Executes a host-owned tool and returns its result or suspension outcome.
   */
  executeHostTool<T extends SerializableValue = SerializableValue>(call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }): Promise<HarnessV2ToolExecutionOutput<T>>;

  /**
   * Requests host approval before executing an adapter-owned built-in tool.
   */
  gateBuiltinTool(call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }): Promise<HarnessV2ToolGateOutput>;

  /**
   * Resolves the sandbox session and working directory for this drive attempt.
   */
  sandbox(): Promise<{
    session: SandboxSession | HarnessV2NetworkSandboxSession;
    workDir: string;
    fence?: number;
  }>;

  /**
   * Emits one adapter stream event to the consumer.
   */
  emit(part: HarnessV2StreamPart): void;

  /**
   * Aborts work when the session or current drive attempt is cancelled.
   */
  abortSignal: AbortSignal;

  /**
   * Signals that the host requests the harness to yield control.
   */
  yieldRequested: AbortSignal;

  /**
   * Optional deadline imposed on the current drive attempt.
   */
  deadline?: number;
}

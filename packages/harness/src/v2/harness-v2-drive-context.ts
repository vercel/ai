import type {
  Experimental_SandboxSession as SandboxSession,
  SerializableValue,
} from '@ai-sdk/provider-utils';
import type {
  HarnessV2Effect,
  HarnessV2EffectContext,
  HarnessV2EffectOutput,
} from './harness-v2-effect';
import type { HarnessV2Log } from './harness-v2-log';
import type { HarnessV2NetworkSandboxSession } from './harness-v2-network-sandbox-session';
import type { HarnessV2StreamPart } from './harness-v2-stream-part';

export type HarnessV2ToolExecutionOutput<
  T extends SerializableValue = SerializableValue,
> =
  | HarnessV2EffectOutput<T>
  | {
      readonly type: 'denied';
      readonly reason: string;
    }
  | {
      readonly type: 'suspended';
      readonly reason: 'approval' | 'client-tool';
    };

export type HarnessV2ToolGateOutput =
  | {
      readonly type: 'approved';
      end(
        output: Exclude<
          HarnessV2ToolExecutionOutput,
          { readonly type: 'suspended' }
        >,
      ): Promise<void>;
    }
  | {
      readonly type: 'denied';
      readonly reason: string;
    }
  | {
      readonly type: 'suspended';
      readonly reason: 'approval';
    };

export interface HarnessV2DriveContext {
  log: HarnessV2Log;
  effect<T extends SerializableValue = SerializableValue>(
    key: string,
    options: Pick<HarnessV2Effect, 'name' | 'replay' | 'input'> &
      Partial<Pick<HarnessV2Effect, 'deliveredSubmissionIds'>>,
    fn: (context: HarnessV2EffectContext) => PromiseLike<T> | AsyncIterable<T>,
  ): Promise<HarnessV2EffectOutput<T>>;
  executeHostTool<T extends SerializableValue = SerializableValue>(call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }): Promise<HarnessV2ToolExecutionOutput<T>>;
  gateBuiltinTool(call: {
    toolCallId: string;
    toolName: string;
    input: unknown;
  }): Promise<HarnessV2ToolGateOutput>;
  sandbox(): Promise<{
    session: SandboxSession | HarnessV2NetworkSandboxSession;
    workDir: string;
    fence?: number;
  }>;
  emit(part: HarnessV2StreamPart): void;
  abortSignal: AbortSignal;
  yieldRequested: AbortSignal;
  deadline?: number;
}

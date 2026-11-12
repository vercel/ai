import { expectTypeOf, test } from 'vitest';
import type { JSONValue, SerializableValue } from '@ai-sdk/provider';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import type { HarnessV2EffectFunction } from '../../../index';
import type {
  HarnessV2DriveContext,
  HarnessV2EffectOptions,
  HarnessV2ToolExecutionValue,
  HarnessV2ToolGateOutput,
  HarnessV2ToolResultOutput,
} from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2EffectContext,
  HarnessV2EffectError,
} from '../../../v2/harness-v2-effect';
import type {
  HarnessV2Log,
  HarnessV2LogEvent,
} from '../../../v2/harness-v2-log';
import type { HarnessV2StreamPart } from '../../../v2/harness-v2-stream-part';
import type {
  HarnessAgentEffectFunction,
  HarnessAgentEffectOptions,
  HarnessAgentExecuteHostToolFunction,
  HarnessAgentFinishStepFunction,
  HarnessAgentFinishTurnFunction,
  HarnessAgentGateBuiltinToolFunction,
  HarnessAgentLog,
  HarnessAgentLogEvent,
  HarnessAgentStreamPart,
} from './types';

test('delivers internal events while accepting zero-argument listeners', () => {
  /**
   * Internal callback contract for committed event delivery.
   */
  type Listener = Parameters<HarnessAgentLog['onAppend']>[0]['listener'];
  expectTypeOf<Parameters<Listener>>().toEqualTypeOf<[HarnessAgentLogEvent]>();
  expectTypeOf<() => void>().toMatchTypeOf<Listener>();
  expectTypeOf<Parameters<HarnessV2Log['onAppend']>[0]>().toEqualTypeOf<
    () => void
  >();
});

test('requires an ID for every internal log event', () => {
  expectTypeOf<HarnessAgentLogEvent>().toMatchTypeOf<{ id: string }>();
});

test('allows adapters to append events without an ID', () => {
  expectTypeOf<{
    type: 'harness:journal';
    data: null;
  }>().toMatchTypeOf<Parameters<HarnessV2Log['append']>[0]>();
});

test('redeclares the adapter effect signature without changing it', () => {
  expectTypeOf<HarnessAgentEffectFunction>().toEqualTypeOf<
    HarnessV2DriveContext['effect']
  >();
  expectTypeOf<HarnessAgentEffectFunction>().toEqualTypeOf<HarnessV2EffectFunction>();
  expectTypeOf<HarnessAgentEffectOptions>().toEqualTypeOf<HarnessV2EffectOptions>();
});

test('redeclares the adapter finish signatures without changing them', () => {
  expectTypeOf<HarnessAgentFinishStepFunction>().toEqualTypeOf<
    HarnessV2DriveContext['finishStep']
  >();
  expectTypeOf<HarnessAgentFinishTurnFunction>().toEqualTypeOf<
    HarnessV2DriveContext['finishTurn']
  >();
});

test('redeclares the adapter host tool signature without changing it', () => {
  expectTypeOf<HarnessAgentExecuteHostToolFunction>().toEqualTypeOf<
    HarnessV2DriveContext['executeHostTool']
  >();
});

test('redeclares the adapter built-in tool gate signature without changing it', () => {
  expectTypeOf<HarnessAgentGateBuiltinToolFunction>().toEqualTypeOf<
    HarnessV2DriveContext['gateBuiltinTool']
  >();
  expectTypeOf<
    Parameters<HarnessV2DriveContext['gateBuiltinTool']>[0]['input']
  >().toEqualTypeOf<JSONValue>();
});

test('reports approved built-in tool calls through effect output shapes', () => {
  /**
   * Approved variant of the built-in tool gate output.
   */
  type Approved = Extract<HarnessV2ToolGateOutput, { type: 'approved' }>;
  expectTypeOf<Parameters<Approved['partial']>>().toEqualTypeOf<
    [HarnessV2ToolExecutionValue]
  >();
  expectTypeOf<Parameters<Approved['result']>>().toEqualTypeOf<
    [HarnessV2ToolExecutionValue]
  >();
  expectTypeOf<Parameters<Approved['error']>>().toEqualTypeOf<
    [HarnessV2EffectError]
  >();
});

test('uses the AI SDK tool result output as the model output', () => {
  expectTypeOf<HarnessV2ToolResultOutput>().toEqualTypeOf<ToolResultOutput>();
});

test('keeps turn start and finish events internal to the agent', () => {
  expectTypeOf<
    Extract<
      HarnessV2LogEvent,
      { type: 'turn-start' | 'finish-step' | 'finish-turn' }
    >
  >().toBeNever();
});

test('keeps progress events internal to the agent', () => {
  expectTypeOf<
    Extract<HarnessV2LogEvent, { type: 'effect-progress' }>
  >().toBeNever();
  expectTypeOf<
    Extract<HarnessAgentLogEvent, { type: 'effect-progress' }>
  >().toEqualTypeOf<{
    readonly type: 'effect-progress';
    readonly data: {
      readonly startId: string;
      readonly partial: SerializableValue;
    };
    readonly id: string;
  }>();
});

test('keeps turn boundary parts out of the adapter stream parts', () => {
  expectTypeOf<
    Extract<HarnessV2StreamPart, { type: 'start' | 'finish-step' | 'finish' }>
  >().toBeNever();
  expectTypeOf<
    Parameters<HarnessV2DriveContext['unsafeEmit']>[0]
  >().toEqualTypeOf<HarnessV2StreamPart>();
  expectTypeOf<
    Parameters<HarnessV2EffectContext['emit']>[0]
  >().toEqualTypeOf<HarnessV2StreamPart>();
});

test('copies every adapter stream part into the agent stream parts', () => {
  expectTypeOf<HarnessV2StreamPart>().toMatchTypeOf<HarnessAgentStreamPart>();
  expectTypeOf<
    Exclude<
      HarnessAgentStreamPart,
      { type: 'start' | 'finish-step' | 'finish' | 'withdraw' | 'yield' }
    >
  >().toEqualTypeOf<HarnessV2StreamPart>();
});

test('derives agent finish parts from the finish function options', () => {
  expectTypeOf<
    { type: 'finish-step' } & Omit<
      Parameters<HarnessV2DriveContext['finishStep']>[0],
      'stepNumber'
    >
  >().toMatchTypeOf<Extract<HarnessAgentStreamPart, { type: 'finish-step' }>>();
  expectTypeOf<
    { type: 'finish' } & Parameters<HarnessV2DriveContext['finishTurn']>[0]
  >().toMatchTypeOf<Extract<HarnessAgentStreamPart, { type: 'finish' }>>();
});

test('carries only serializable error and raw payloads', () => {
  expectTypeOf<
    Extract<HarnessV2StreamPart, { type: 'error' }>['error']
  >().toEqualTypeOf<HarnessV2EffectError>();
  expectTypeOf<
    Extract<HarnessAgentStreamPart, { type: 'error' }>['error']
  >().toEqualTypeOf<HarnessV2EffectError>();
  expectTypeOf<
    Extract<HarnessV2StreamPart, { type: 'raw' }>['rawValue']
  >().toEqualTypeOf<SerializableValue>();
  expectTypeOf<
    Extract<HarnessAgentStreamPart, { type: 'raw' }>['rawValue']
  >().toEqualTypeOf<SerializableValue>();
});

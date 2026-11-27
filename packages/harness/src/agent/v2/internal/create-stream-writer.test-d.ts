import { expectTypeOf, test } from 'vitest';
import type { SerializableValue } from '@ai-sdk/provider';
import type { ToolSet } from '@ai-sdk/provider-utils';
import type {
  StaticToolOutputDenied,
  ToolApprovalRequestOutput,
  ToolApprovalResponseOutput,
  TypedToolError,
  TypedToolResult,
} from 'ai';
import type { HarnessV2DriveContext } from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2EffectContext,
  HarnessV2EffectError,
} from '../../../v2/harness-v2-effect';
import type { HarnessV2StreamPart } from '../../../v2/harness-v2-stream-part';
import type {
  HarnessAgentStreamPart,
  createStreamWriter,
  decodeStreamRecords,
} from './create-stream-writer';
import type { HarnessAgentStorageEncryption } from './create-storage-encryption';

test('requires explicit encryption at stream storage boundaries', () => {
  expectTypeOf<Parameters<typeof createStreamWriter>[0]>().toMatchTypeOf<{
    encryption: HarnessAgentStorageEncryption;
  }>();
  expectTypeOf<Parameters<typeof decodeStreamRecords>[0]>().toMatchTypeOf<{
    encryption: HarnessAgentStorageEncryption;
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
      {
        type:
          | 'start-turn'
          | 'prompt-message'
          | 'steering-message'
          | 'finish-step'
          | 'finish-turn'
          | 'retract'
          | 'yield'
          | 'settle'
          | 'tool-approval-request'
          | 'tool-approval-response'
          | 'tool-output-denied'
          | 'tool-result'
          | 'tool-error';
      }
    >
  >().toEqualTypeOf<HarnessV2StreamPart>();
});

test('keeps engine-emitted tool parts out of the adapter stream parts', () => {
  expectTypeOf<
    Extract<
      HarnessV2StreamPart,
      { type: 'tool-approval-request' | 'tool-result' | 'tool-error' }
    >
  >().toBeNever();
});

test('uses the AI SDK tool stream parts', () => {
  expectTypeOf<
    Extract<HarnessAgentStreamPart, { type: 'tool-approval-request' }>
  >().toEqualTypeOf<ToolApprovalRequestOutput<ToolSet>>();
  expectTypeOf<
    Extract<HarnessAgentStreamPart, { type: 'tool-approval-response' }>
  >().toEqualTypeOf<ToolApprovalResponseOutput<ToolSet>>();
  expectTypeOf<
    Extract<HarnessAgentStreamPart, { type: 'tool-output-denied' }>
  >().toEqualTypeOf<
    { type: 'tool-output-denied' } & StaticToolOutputDenied<ToolSet>
  >();
  expectTypeOf<
    Extract<HarnessAgentStreamPart, { type: 'tool-result' }>
  >().toEqualTypeOf<{ type: 'tool-result' } & TypedToolResult<ToolSet>>();
  expectTypeOf<
    Extract<HarnessAgentStreamPart, { type: 'tool-error' }>
  >().toEqualTypeOf<{ type: 'tool-error' } & TypedToolError<ToolSet>>();
});

test('derives agent finish parts from the finish function options', () => {
  expectTypeOf<
    { type: 'finish-step' } & Omit<
      Parameters<HarnessV2DriveContext['finishStep']>[0],
      'stepNumber'
    >
  >().toMatchTypeOf<Extract<HarnessAgentStreamPart, { type: 'finish-step' }>>();
  expectTypeOf<
    { type: 'finish-turn' } & Parameters<HarnessV2DriveContext['finishTurn']>[0]
  >().toMatchTypeOf<Extract<HarnessAgentStreamPart, { type: 'finish-turn' }>>();
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

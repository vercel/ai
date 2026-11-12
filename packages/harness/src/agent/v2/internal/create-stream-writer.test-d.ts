import { expectTypeOf, test } from 'vitest';
import type { SerializableValue } from '@ai-sdk/provider';
import type { HarnessV2DriveContext } from '../../../v2/harness-v2-drive-context';
import type {
  HarnessV2EffectContext,
  HarnessV2EffectError,
} from '../../../v2/harness-v2-effect';
import type { HarnessV2StreamPart } from '../../../v2/harness-v2-stream-part';
import type { HarnessAgentStreamPart } from './create-stream-writer';

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

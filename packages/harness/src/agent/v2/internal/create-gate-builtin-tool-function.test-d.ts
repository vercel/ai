import { expectTypeOf, test } from 'vitest';
import type { JSONValue } from '@ai-sdk/provider';
import type {
  HarnessV2DriveContext,
  HarnessV2ToolExecutionValue,
  HarnessV2ToolGateOutput,
} from '../../../v2/harness-v2-drive-context';
import type { HarnessV2EffectError } from '../../../v2/harness-v2-effect';
import type { HarnessAgentGateBuiltinToolFunction } from './create-gate-builtin-tool-function';

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

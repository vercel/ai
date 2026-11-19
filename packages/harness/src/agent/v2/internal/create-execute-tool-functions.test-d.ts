import { expectTypeOf, test } from 'vitest';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import type {
  HarnessV2DriveContext,
  HarnessV2ToolResultOutput,
} from '../../../v2/harness-v2-drive-context';
import type {
  HarnessAgentExecuteBuiltinToolFunction,
  HarnessAgentExecuteHostToolFunction,
} from './create-execute-tool-functions';

test('redeclares the adapter host tool signature without changing it', () => {
  expectTypeOf<HarnessAgentExecuteHostToolFunction>().toEqualTypeOf<
    HarnessV2DriveContext['executeHostTool']
  >();
});

test('redeclares the adapter built-in tool execution signature without changing it', () => {
  expectTypeOf<HarnessAgentExecuteBuiltinToolFunction>().toEqualTypeOf<
    HarnessV2DriveContext['executeBuiltinTool']
  >();
});

test('uses the AI SDK tool result output as the model output', () => {
  expectTypeOf<HarnessV2ToolResultOutput>().toEqualTypeOf<ToolResultOutput>();
});

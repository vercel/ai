import {
  type InferToolInput,
  type InferToolOutput,
  type Tool,
} from '@ai-sdk/provider-utils';
import { expectTypeOf, test } from 'vitest';
import { z } from 'zod/v4';
import type { HarnessBuiltinToolsOf } from '../agent/harness-agent-tool-types';
import type { HarnessAgentAdapter } from '../agent/harness-agent-types';
import type { HarnessAgent } from '../agent/harness-agent';
import type { HarnessV2 } from './harness-v2';
import type {
  HarnessV2BuiltinTool,
  HarnessV2BuiltinToolSet,
} from './harness-v2-builtin-tool';

const builtinTools = {
  read: {
    inputSchema: z.object({ path: z.string() }),
    outputSchema: z.string(),
    replay: 'safe',
  },
} satisfies HarnessV2BuiltinToolSet;

test('preserves Tool input and output inference', () => {
  type BuiltinTool = HarnessV2BuiltinTool<{ path: string }, string>;

  expectTypeOf<InferToolInput<BuiltinTool>>().toEqualTypeOf<{
    path: string;
  }>();
  expectTypeOf<InferToolOutput<BuiltinTool>>().toEqualTypeOf<string>();
  expectTypeOf<BuiltinTool>().toExtend<Tool<{ path: string }, string>>();
  expectTypeOf(builtinTools.read).toExtend<BuiltinTool>();
});

test('rejects boolean and function approval requirements on existing objects', () => {
  const booleanApproval = { ...builtinTools.read, needsApproval: true };
  const functionApproval = {
    ...builtinTools.read,
    needsApproval: async () => true,
  };

  expectTypeOf(booleanApproval).not.toExtend<HarnessV2BuiltinToolSet[string]>();
  expectTypeOf(functionApproval).not.toExtend<
    HarnessV2BuiltinToolSet[string]
  >();
  expectTypeOf<{ read: typeof booleanApproval }>().not.toExtend<
    HarnessV2['builtinTools']
  >();
  expectTypeOf<{ read: typeof functionApproval }>().not.toExtend<
    HarnessV2['builtinTools']
  >();
  type InvalidHarness = Omit<HarnessV2, 'builtinTools'> & {
    builtinTools: { read: typeof booleanApproval };
  };
  expectTypeOf<InvalidHarness>().not.toExtend<
    ConstructorParameters<typeof HarnessAgent<InvalidHarness>>[0]['harness']
  >();
});

test('keeps built-in tool declarations and their map readonly', () => {
  type BuiltinTool = HarnessV2BuiltinTool<{ path: string }, string>;

  expectTypeOf<Pick<BuiltinTool, 'replay' | 'needsApproval'>>().toEqualTypeOf<{
    readonly replay?: 'never' | 'safe';
    readonly needsApproval?: never;
  }>();
  expectTypeOf<HarnessV2<typeof builtinTools>['builtinTools']>().toEqualTypeOf<
    Readonly<typeof builtinTools>
  >();
});

test('preserves built-in tool types through the shared adapter interface', () => {
  type Harness = HarnessV2<typeof builtinTools>;

  expectTypeOf<Harness>().toExtend<HarnessAgentAdapter>();
  expectTypeOf<HarnessBuiltinToolsOf<Harness>['read']>().toEqualTypeOf<
    (typeof builtinTools)['read']
  >();
});

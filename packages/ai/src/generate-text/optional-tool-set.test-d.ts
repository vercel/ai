import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { StepResult } from './step-result';
import type { StaticToolCall } from './tool-call';
import type { StaticToolError } from './tool-error';
import type {
  ToolExecutionEndEvent,
  ToolExecutionStartEvent,
} from './tool-execution-events';
import type { StaticToolOutputDenied } from './tool-output-denied';
import type { StaticToolResult } from './tool-result';

describe('optional tools', () => {
  const search = tool({
    inputSchema: z.object({ query: z.string() }),
    execute: async () => 'result',
  });
  const lookup = tool({
    inputSchema: z.object({ id: z.number() }),
    contextSchema: z.object({ apiKey: z.string() }),
    execute: async () => ({ found: true }),
  });
  const extraTools: { lookup: typeof lookup } | undefined =
    Math.random() > 0.5 ? { lookup } : undefined;
  const tools = { search, ...extraTools };
  type Tools = typeof tools;

  it('keeps static tool calls defined and preserves input inference', () => {
    expectTypeOf<Extract<StaticToolCall<Tools>, undefined>>().toBeNever();
    expectTypeOf<StaticToolCall<Tools>['toolName']>().toEqualTypeOf<
      'search' | 'lookup'
    >();
    expectTypeOf<
      Extract<StaticToolCall<Tools>, { toolName: 'lookup' }>['input']
    >().toEqualTypeOf<{ id: number }>();
  });

  it('keeps static tool results defined and preserves output inference', () => {
    expectTypeOf<Extract<StaticToolResult<Tools>, undefined>>().toBeNever();
    expectTypeOf<StaticToolResult<Tools>['toolName']>().toEqualTypeOf<
      'search' | 'lookup'
    >();
    expectTypeOf<
      Extract<StaticToolResult<Tools>, { toolName: 'search' }>['output']
    >().toEqualTypeOf<string>();
    expectTypeOf<
      Extract<StaticToolResult<Tools>, { toolName: 'lookup' }>['output']
    >().toEqualTypeOf<{ found: boolean }>();
  });

  it('keeps tool errors and denied outputs defined', () => {
    expectTypeOf<Extract<StaticToolError<Tools>, undefined>>().toBeNever();
    expectTypeOf<
      Extract<StaticToolOutputDenied<Tools>, undefined>
    >().toBeNever();
    expectTypeOf<StaticToolError<Tools>['toolName']>().toEqualTypeOf<
      'search' | 'lookup'
    >();
    expectTypeOf<StaticToolOutputDenied<Tools>['toolName']>().toEqualTypeOf<
      'search' | 'lookup'
    >();
  });

  it('keeps execution events defined and preserves tool context', () => {
    expectTypeOf<
      Extract<ToolExecutionStartEvent<Tools>, undefined>
    >().toBeNever();
    expectTypeOf<
      Extract<ToolExecutionEndEvent<Tools>, undefined>
    >().toBeNever();
    expectTypeOf<
      Extract<
        ToolExecutionStartEvent<Tools>,
        { toolCall: { toolName: 'lookup' } }
      >['toolContext']
    >().toEqualTypeOf<{ apiKey: string }>();
    expectTypeOf<
      Extract<
        ToolExecutionEndEvent<Tools>,
        { toolCall: { toolName: 'lookup' } }
      >['toolContext']
    >().toEqualTypeOf<{ apiKey: string }>();
  });

  it('allows reading tool names from step results without undefined guards', () => {
    const getToolNames = (step: StepResult<Tools>) => ({
      calls: step.toolCalls.map(call => call.toolName),
      results: step.toolResults.map(result => result.toolName),
      staticCalls: step.staticToolCalls.map(call => call.toolName),
      staticResults: step.staticToolResults.map(result => result.toolName),
    });

    expectTypeOf(getToolNames).returns.toEqualTypeOf<{
      calls: string[];
      results: string[];
      staticCalls: Array<'search' | 'lookup'>;
      staticResults: Array<'search' | 'lookup'>;
    }>();
  });
});

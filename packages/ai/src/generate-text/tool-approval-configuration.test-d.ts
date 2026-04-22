import {
  InferToolSetContext,
  ModelMessage,
  tool,
} from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ToolApprovalConfiguration } from './tool-approval-configuration';
import type { TypedToolCall } from './tool-call';

describe('ToolApprovalConfiguration', () => {
  const tools = {
    weather: tool({
      inputSchema: z.object({
        location: z.string(),
      }),
      contextSchema: z.object({
        weatherApiKey: z.string(),
      }),
    }),
    calculator: tool({
      inputSchema: z.object({
        expression: z.string(),
      }),
    }),
  };

  type Tools = typeof tools;
  type ToolSetContext = InferToolSetContext<Tools>;

  describe('per-tool (object) configuration', () => {
    it('allows string statuses and object statuses with an optional reason', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        weather: 'not-applicable',
        calculator: { type: 'denied', reason: 'blocked by policy' },
      };
    });

    it('allows mixed per-tool string literals for every status variant', () => {
      const _full: ToolApprovalConfiguration<Tools> = {
        weather: 'approved',
        calculator: 'user-approval',
      };
      const _second: ToolApprovalConfiguration<Tools> = {
        weather: 'denied',
        calculator: 'not-applicable',
      };
    });

    it('allows object-typed statuses without a reason', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        weather: { type: 'approved' },
        calculator: { type: 'user-approval' },
      };
    });

    it('infers per-tool callback input, toolContext, and execution options (toolContext, not context)', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        weather: (input, { toolContext, toolCallId, messages }) => {
          expectTypeOf(input).toEqualTypeOf<{ location: string }>();
          expectTypeOf(toolContext).toEqualTypeOf<{ weatherApiKey: string }>();
          expectTypeOf(toolCallId).toEqualTypeOf<string>();
          expectTypeOf(messages).toEqualTypeOf<ModelMessage[]>();

          return 'user-approval';
        },
        calculator: 'approved',
      };
    });

    it('infers `toolContext: never` for tools without a context schema', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        calculator: (input, options) => {
          expectTypeOf(input).toEqualTypeOf<{ expression: string }>();
          expectTypeOf(options.toolContext).toEqualTypeOf<never>();

          return 'denied';
        },
      };
    });

    it('allows async per-tool approval callbacks (MaybePromiseLike)', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        weather: async (input, { toolContext }) => {
          expectTypeOf(input).toEqualTypeOf<{ location: string }>();
          expectTypeOf(toolContext).toEqualTypeOf<{ weatherApiKey: string }>();
          return Promise.resolve('approved' as const);
        },
      };
    });

    it('allows per-tool callbacks that return undefined (treated as not-applicable at runtime)', () => {
      const _sync: ToolApprovalConfiguration<Tools> = {
        weather: () => undefined,
      };
      const _async: ToolApprovalConfiguration<Tools> = {
        weather: async () => Promise.resolve(undefined),
      };
    });

    it('allows an empty or partial per-tool object', () => {
      const _empty: ToolApprovalConfiguration<Tools> = {};
      const _partial: ToolApprovalConfiguration<Tools> = {
        weather: 'approved',
      };
    });
  });

  describe('generic function configuration', () => {
    it('infers toolCall, tools, toolsContext, and messages for the top-level function form', () => {
      const _config: ToolApprovalConfiguration<Tools> = ({
        toolCall,
        tools: toolsArg,
        toolsContext,
        messages,
      }) => {
        expectTypeOf(toolCall).toEqualTypeOf<TypedToolCall<Tools>>();
        expectTypeOf(toolsArg).toEqualTypeOf<Tools | undefined>();
        expectTypeOf(toolsContext).toEqualTypeOf<ToolSetContext>();
        expectTypeOf(messages).toEqualTypeOf<ModelMessage[]>();

        return 'user-approval';
      };
    });

    it('allows async generic approval functions (MaybePromiseLike)', () => {
      const _config: ToolApprovalConfiguration<Tools> = async options => {
        expectTypeOf(options.toolsContext).toEqualTypeOf<ToolSetContext>();
        return Promise.resolve('not-applicable' as const);
      };
    });

    it('allows generic approval functions that return undefined (treated as not-applicable at runtime)', () => {
      const _sync: ToolApprovalConfiguration<Tools> = () => undefined;
      const _async: ToolApprovalConfiguration<Tools> = async () =>
        Promise.resolve(undefined);
    });
  });

  describe('negative cases', () => {
    it('rejects approval configuration for unknown tool keys', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        // @ts-expect-error tool approval only accepts keys from the provided tool set
        search: 'approved',
      };
    });

    it('rejects per-tool callbacks with the wrong input type for a tool', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        // @ts-expect-error weather approval callbacks must receive the weather tool input
        weather: (input: { expression: string }) =>
          input.expression.length > 0 ? 'approved' : 'denied',
      };
    });

    it('rejects per-tool callbacks with the wrong return type', () => {
      const _config: ToolApprovalConfiguration<Tools> = {
        // @ts-expect-error approval callbacks must return a valid approval state
        calculator: () => true,
      };
    });

    it('rejects a generic function with the wrong return type', () => {
      // @ts-expect-error approval function must return a valid approval state
      const _invalidGeneric: ToolApprovalConfiguration<Tools> = () => true;
    });
  });
});

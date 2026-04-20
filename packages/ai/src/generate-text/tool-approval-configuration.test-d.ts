import { ModelMessage, tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import type { ToolApprovalConfiguration } from './tool-approval-configuration';

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

  it('allows booleans and infers tool-specific approval callback types', () => {
    const config: ToolApprovalConfiguration<typeof tools> = {
      weather: (input, { context, toolCallId, messages }) => {
        expectTypeOf(input).toEqualTypeOf<{ location: string }>();
        expectTypeOf(context).toEqualTypeOf<{ weatherApiKey: string }>();
        expectTypeOf(toolCallId).toEqualTypeOf<string>();
        expectTypeOf(messages).toEqualTypeOf<ModelMessage[]>();

        return true;
      },
      calculator: false,
    };

    expectTypeOf(config).toEqualTypeOf<
      ToolApprovalConfiguration<typeof tools>
    >();
  });

  it('keeps each tool approval callback specific to that tool', () => {
    const config: ToolApprovalConfiguration<typeof tools> = {
      calculator: (input, options) => {
        expectTypeOf(input).toEqualTypeOf<{ expression: string }>();
        expectTypeOf(options.context).toEqualTypeOf<never>();

        return false;
      },
    };

    expectTypeOf(config).toEqualTypeOf<
      ToolApprovalConfiguration<typeof tools>
    >();
  });

  describe('negative cases', () => {
    it('rejects approval configuration for unknown tool keys', () => {
      const config: ToolApprovalConfiguration<typeof tools> = {
        // @ts-expect-error tool approval only accepts keys from the provided tool set
        search: true,
      };

      expectTypeOf(config).toEqualTypeOf<
        ToolApprovalConfiguration<typeof tools>
      >();
    });

    it('rejects callbacks with the wrong input type for a tool', () => {
      const config: ToolApprovalConfiguration<typeof tools> = {
        // @ts-expect-error weather approval callbacks must receive the weather tool input
        weather: (input: { expression: string }) => input.expression.length > 0,
      };

      expectTypeOf(config).toEqualTypeOf<
        ToolApprovalConfiguration<typeof tools>
      >();
    });

    it('rejects callbacks with the wrong return type', () => {
      const config: ToolApprovalConfiguration<typeof tools> = {
        // @ts-expect-error approval callbacks must return a boolean or promise-like boolean
        calculator: () => 'approved',
      };

      expectTypeOf(config).toEqualTypeOf<
        ToolApprovalConfiguration<typeof tools>
      >();
    });
  });
});

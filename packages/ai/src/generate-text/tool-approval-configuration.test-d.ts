import { Context, ModelMessage, tool } from '@ai-sdk/provider-utils';
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

  type UserContext = Context & {
    requestId: string;
  };

  it('allows booleans and infers approval callback input and context types', () => {
    const config: ToolApprovalConfiguration<typeof tools, UserContext> = {
      weather: (input, { context, toolCallId, messages }) => {
        expectTypeOf(input).toEqualTypeOf<{ location: string }>();
        expectTypeOf(context).toEqualTypeOf<
          Context & {
            weatherApiKey: string;
          } & {
            requestId: string;
          }
        >();
        expectTypeOf(toolCallId).toEqualTypeOf<string>();
        expectTypeOf(messages).toEqualTypeOf<ModelMessage[]>();

        return true;
      },
      calculator: false,
    };

    expectTypeOf(config).toEqualTypeOf<
      ToolApprovalConfiguration<typeof tools, UserContext>
    >();
  });

  it('keeps each tool approval callback specific to that tool', () => {
    const config: ToolApprovalConfiguration<typeof tools, UserContext> = {
      calculator: (input, { context }) => {
        expectTypeOf(input).toEqualTypeOf<{ expression: string }>();
        expectTypeOf(context.weatherApiKey).toEqualTypeOf<string>();
        expectTypeOf(context.requestId).toEqualTypeOf<string>();

        return false;
      },
    };

    expectTypeOf(config).toEqualTypeOf<
      ToolApprovalConfiguration<typeof tools, UserContext>
    >();
  });

  describe('negative cases', () => {
    it('rejects approval configuration for unknown tool keys', () => {
      const config: ToolApprovalConfiguration<typeof tools, UserContext> = {
        // @ts-expect-error tool approval only accepts keys from the provided tool set
        search: true,
      };

      expectTypeOf(config).toEqualTypeOf<
        ToolApprovalConfiguration<typeof tools, UserContext>
      >();
    });

    it('rejects callbacks with the wrong input type for a tool', () => {
      const config: ToolApprovalConfiguration<typeof tools, UserContext> = {
        // @ts-expect-error weather approval callbacks must receive the weather tool input
        weather: (input: { expression: string }) => input.expression.length > 0,
      };

      expectTypeOf(config).toEqualTypeOf<
        ToolApprovalConfiguration<typeof tools, UserContext>
      >();
    });

    it('rejects callbacks with the wrong return type', () => {
      const config: ToolApprovalConfiguration<typeof tools, UserContext> = {
        // @ts-expect-error approval callbacks must return a boolean or promise-like boolean
        calculator: () => 'approved',
      };

      expectTypeOf(config).toEqualTypeOf<
        ToolApprovalConfiguration<typeof tools, UserContext>
      >();
    });
  });
});

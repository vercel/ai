import { z } from 'zod/v4';
import { tool } from '@ai-sdk/provider-utils';
import { ChatInit } from './chat';
import { ToolSet } from '../generate-text/tool-set';
import { InferUITools, UIDataTypes, UIMessage, UITools } from './ui-messages';
import { describe, it, expectTypeOf } from 'vitest';

type ToolCallCallback<TOOLS extends ToolSet | UITools> = NonNullable<
  ChatInit<
    UIMessage<
      never,
      UIDataTypes,
      TOOLS extends ToolSet ? InferUITools<TOOLS> : TOOLS
    >
  >['onToolCall']
>;

type ToolCallArgument<TOOLS extends ToolSet | UITools> = Parameters<
  ToolCallCallback<TOOLS>
>[0]['toolCall'];

type ToolOutputCallback<TOOLS extends ToolSet | UITools> = NonNullable<
  ChatInit<
    UIMessage<
      never,
      UIDataTypes,
      TOOLS extends ToolSet ? InferUITools<TOOLS> : TOOLS
    >
  >['onToolOutput']
>;

type ToolOutputArgument<TOOLS extends ToolSet | UITools> = Parameters<
  ToolOutputCallback<TOOLS>
>[0]['toolOutput'];

describe('onToolCall', () => {
  describe('no helpers', () => {
    it('single tool with output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: string;
        };
      };

      expectTypeOf<
        ToolCallArgument<Tools> & { dynamic?: false }
      >().toMatchTypeOf<{
        toolName: 'simple';
        input: number;
      }>();
    });

    it('single tool without output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: undefined;
        };
      };

      expectTypeOf<
        ToolCallArgument<Tools> & { dynamic?: false }
      >().toMatchTypeOf<{
        toolName: 'simple';
        input: number;
      }>();
    });

    it('multiple tools with output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: string;
        };
        complex: {
          input: {
            title: string;
            description: string;
          };
          output: Array<{
            message: string;
          }>;
        };
      };

      expectTypeOf<
        ToolCallArgument<Tools> & { dynamic?: false }
      >().toMatchTypeOf<
        | {
            toolName: 'simple';
            input: number;
          }
        | {
            toolName: 'complex';
            input: {
              title: string;
              description: string;
            };
          }
      >();
    });

    it('multiple tools without output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: undefined;
        };
        complex: {
          input: {
            title: string;
            description: string;
          };
          output: undefined;
        };
      };

      expectTypeOf<
        ToolCallArgument<Tools> & { dynamic?: false }
      >().toMatchTypeOf<
        | {
            toolName: 'simple';
            input: number;
          }
        | {
            toolName: 'complex';
            input: {
              title: string;
              description: string;
            };
          }
      >();
    });
  });

  describe('with helpers', () => {
    it('single tool with output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
        outputSchema: z.string(),
      });

      const tools = {
        simple,
      };

      expectTypeOf<
        ToolCallArgument<typeof tools> & { dynamic?: false }
      >().toMatchTypeOf<{
        toolName: 'simple';
        input: number;
      }>();
    });

    it('single tool without output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
      });

      const tools = {
        simple,
      };

      expectTypeOf<
        ToolCallArgument<typeof tools> & { dynamic?: false }
      >().toMatchTypeOf<{
        toolName: 'simple';
        input: number;
      }>();
    });

    it('multiple tools with output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
        outputSchema: z.string(),
      });

      const complex = tool({
        inputSchema: z.object({
          title: z.string(),
          description: z.string(),
        }),
        outputSchema: z.array(
          z.object({
            message: z.string(),
          }),
        ),
      });

      const tools = {
        simple,
        complex,
      };

      expectTypeOf<
        ToolCallArgument<typeof tools> & { dynamic?: false }
      >().toMatchTypeOf<
        | {
            toolName: 'simple';
            input: number;
          }
        | {
            toolName: 'complex';
            input: {
              title: string;
              description: string;
            };
          }
      >();
    });

    it('multiple tools without output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
      });

      const complex = tool({
        inputSchema: z.object({
          title: z.string(),
          description: z.string(),
        }),
      });

      const tools = {
        simple,
        complex,
      };

      expectTypeOf<
        ToolCallArgument<typeof tools> & { dynamic?: false }
      >().toMatchTypeOf<
        | {
            toolName: 'simple';
            input: number;
          }
        | {
            toolName: 'complex';
            input: {
              title: string;
              description: string;
            };
          }
      >();
    });
  });
});

describe('onToolOutput', () => {
  // Type tests are complex due to UIMessageChunk union types
  // The functionality is tested in the integration tests
  it('should be defined', () => {
    expectTypeOf<ChatInit<UIMessage>['onToolOutput']>().not.toBeUndefined();
  });

  describe('no helpers', () => {
    it('single tool with output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: string;
        };
      };

      expectTypeOf<ToolOutputArgument<Tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });

    it('single tool without output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: undefined;
        };
      };

      expectTypeOf<ToolOutputArgument<Tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });

    it('multiple tools with output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: string;
        };
        complex: {
          input: {
            title: string;
            description: string;
          };
          output: Array<{
            message: string;
          }>;
        };
      };

      expectTypeOf<ToolOutputArgument<Tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });

    it('multiple tools without output schema', () => {
      type Tools = {
        simple: {
          input: number;
          output: undefined;
        };
        complex: {
          input: {
            title: string;
            description: string;
          };
          output: undefined;
        };
      };

      expectTypeOf<ToolOutputArgument<Tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });
  });

  describe('with helpers', () => {
    it('single tool with output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
        outputSchema: z.string(),
      });

      const tools = {
        simple,
      };

      expectTypeOf<ToolOutputArgument<typeof tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });

    it('single tool without output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
      });

      const tools = {
        simple,
      };

      expectTypeOf<ToolOutputArgument<typeof tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });

    it('multiple tools with output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
        outputSchema: z.string(),
      });

      const complex = tool({
        inputSchema: z.object({
          title: z.string(),
          description: z.string(),
        }),
        outputSchema: z.array(
          z.object({
            message: z.string(),
          }),
        ),
      });

      const tools = {
        simple,
        complex,
      };

      expectTypeOf<ToolOutputArgument<typeof tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });

    it('multiple tools without output schema', () => {
      const simple = tool({
        inputSchema: z.number(),
      });

      const complex = tool({
        inputSchema: z.object({
          title: z.string(),
          description: z.string(),
        }),
      });

      const tools = {
        simple,
        complex,
      };

      expectTypeOf<ToolOutputArgument<typeof tools>>().toMatchTypeOf<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        input: unknown;
        output: unknown;
        providerExecuted?: boolean;
        preliminary?: boolean;
      }>();
    });
  });
});

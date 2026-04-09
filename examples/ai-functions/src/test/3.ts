import { JSONValue } from 'ai';
import { describe, expectTypeOf, it } from 'vitest';

// This file is intentionally red until the generateText inline-tools
// inference bug is fixed. Compile it directly to confirm the current
// implementation still accepts `context: {}` for inline tool objects.

type Context = Record<string, unknown>;

type Schema<T> = {
  readonly __type?: T;
};

const schema = <T>(): Schema<T> => ({});

type Tool<
  INPUT extends JSONValue | unknown | never = any,
  CONTEXT extends Context = Record<never, never>,
> = {
  inputSchema: Schema<INPUT>;
  contextSchema?: Schema<CONTEXT>;
  execute?: (input: INPUT, options: { context: CONTEXT }) => unknown;
};

type InferToolContext<TOOL extends Tool<any, any>> =
  TOOL extends Tool<any, infer CONTEXT> ? CONTEXT : never;

export function tool<INPUT, CONTEXT extends Context>(
  tool: Tool<INPUT, CONTEXT>,
): Tool<INPUT, CONTEXT>;
export function tool<CONTEXT extends Context>(
  tool: Tool<never, CONTEXT>,
): Tool<never, CONTEXT>;
export function tool<INPUT>(tool: Tool<INPUT, never>): Tool<INPUT, never>;
export function tool(tool: any): any {
  return tool;
}

export type ToolSet = Record<string, Tool<any, any>>;

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

type InferToolSetContext<TOOLS extends ToolSet> = UnionToIntersection<
  {
    [K in keyof TOOLS]: InferToolContext<NoInfer<TOOLS[K]>>;
  }[keyof TOOLS]
>;

declare function inferA<TOOLS extends ToolSet = ToolSet>(options: {
  tools: TOOLS;
  context: InferToolSetContext<NoInfer<TOOLS>>;
}): {
  tools: NoInfer<TOOLS>;
  context: InferToolSetContext<NoInfer<TOOLS>>;
};

const mixedTools = {
  weather: tool({
    inputSchema: schema<{ location: string }>(),
    contextSchema: schema<{ weatherApiKey: string }>(),
    execute: async ({ location }, { context: { weatherApiKey } }) => {
      return { location, weatherApiKey };
    },
  }),
  calculator: tool({
    inputSchema: schema<{ expression: string }>(),
  }),
};

describe('target behavior', () => {
  it('should reject empty context for hoisted tools in inferA', () => {
    inferA({
      tools: mixedTools,
      // @ts-expect-error - hoisted tools preserve the required weatherApiKey
      context: {},
    });
  });

  it('should reject empty context for inline tools in inferA', () => {
    inferA({
      tools: {
        weather: tool({
          inputSchema: schema<{ location: string }>(),
          contextSchema: schema<{ weatherApiKey: string }>(),
          execute: async ({ location }, { context: { weatherApiKey } }) => {
            return { location, weatherApiKey };
          },
        }),
        calculator: tool({
          inputSchema: schema<{ expression: string }>(),
        }),
      },
      // @ts-expect-error - inline tools should also require weatherApiKey
      context: {},
    });
  });
});

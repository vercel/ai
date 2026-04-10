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
  CONTEXT extends Context | unknown | never = any,
> = {
  inputSchema: Schema<INPUT>;
  contextSchema?: Schema<CONTEXT>;
  execute?: (input: INPUT, options: { context: NoInfer<CONTEXT> }) => unknown;
};

type InferToolContext<TOOL extends Tool> =
  TOOL extends Tool<any, infer CONTEXT>
    ? HasRequiredKey<CONTEXT> extends true
      ? CONTEXT
      : never
    : never;

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

export type ToolSet = Record<
  string,
  (Tool<never, never> | Tool<any, never> | Tool<never, any> | Tool<any, any>) &
    Pick<Tool<any, any>, 'execute'>
>;

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

// if there is any required key in the context, return true
type HasRequiredKey<CONTEXT> = {} extends CONTEXT ? false : true;

type ContextParameter<TOOLS extends ToolSet, USER_CONTEXT extends Context> = {
  tools?: TOOLS;
} & (HasRequiredKey<InferToolSetContext<TOOLS>> extends true
  ? { context: InferToolSetContext<TOOLS> & USER_CONTEXT }
  : HasRequiredKey<USER_CONTEXT> extends true
    ? { context: USER_CONTEXT }
    : { context?: USER_CONTEXT });

type PrepareStepFunction<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Record<string, unknown>,
> = (options: {
  context: InferToolSetContext<NoInfer<TOOLS>> & USER_CONTEXT;
}) =>
  | { context?: InferToolSetContext<NoInfer<TOOLS>> & USER_CONTEXT }
  | undefined;

declare function inferA<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>(options: {
  tools: TOOLS;
  context: InferToolSetContext<NoInfer<TOOLS>> & USER_CONTEXT;
}): {
  tools: NoInfer<TOOLS>;
  context: InferToolSetContext<NoInfer<TOOLS>> & NoInfer<USER_CONTEXT>;
};

declare function generateTextLike<
  TOOLS extends ToolSet,
  USER_CONTEXT extends Context = Context,
>(
  options: ContextParameter<NoInfer<TOOLS>, NoInfer<USER_CONTEXT>> & {
    prepareStep?: PrepareStepFunction<NoInfer<TOOLS>, USER_CONTEXT>;
  },
): {
  tools: TOOLS;
  context: InferToolSetContext<NoInfer<TOOLS>> & USER_CONTEXT;
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

describe('generateText target behavior', () => {
  it('keeps the control case correct', () => {
    type A = HasRequiredKey<InferToolSetContext<typeof mixedTools>>;
    type A2 = HasRequiredKey<{}>;
    type B = InferToolSetContext<typeof mixedTools>;

    type C = typeof mixedTools;
    type D = UnionToIntersection<{
      [K in keyof C]: InferToolContext<NoInfer<C[K]>>;
    }>;
    type X = ContextParameter<typeof mixedTools, Context>;

    type I1 = InferToolContext<NoInfer<C['weather']>>;
    type I2 = InferToolContext<NoInfer<C['calculator']>>;
    type I3 = InferToolContext<
      Tool<{ location: string }, { weatherApiKey: string }>
    >;

    expectTypeOf<X>().toMatchTypeOf<{
      tools?: typeof mixedTools;
      context: {
        weatherApiKey: string;
      } & Context;
    }>();
  });

  it('rejects empty context for hoisted tools in inferA', () => {
    inferA({
      tools: mixedTools,
      // @ts-expect-error - hoisted tools preserve the required weatherApiKey
      context: {},
    });
  });

  it('rejects no context parameter for hoisted tools in inferA', () => {
    // @ts-expect-error - no context parameter should be required
    inferA({
      tools: mixedTools,
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

  it('should reject empty context for inline tools in generateTextLike', () => {
    generateTextLike({
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
      prepareStep: ({
        context,
      }: {
        context: {
          somethingElse: string;
        };
      }) => ({ context }),
    });
  });
});

// This file is intentionally red until the generateText inline-tools
// inference bug is fixed. Compile it directly to confirm the current
// implementation still accepts `context: {}` for inline tool objects.

type Context = Record<string, unknown>;

type Schema<T> = {
  readonly __type?: T;
};

const schema = <T>(): Schema<T> => ({});

type Tool<CONTEXT extends Context | unknown | never = any> = {
  contextSchema?: Schema<CONTEXT>;
  execute?: (context: NoInfer<CONTEXT>) => unknown;
};

type InferToolContext<TOOL extends Tool> =
  TOOL extends Tool<infer CONTEXT>
    ? HasRequiredKey<CONTEXT> extends true
      ? CONTEXT
      : never
    : never;

export function tool<CONTEXT extends Context>(
  tool: Tool<CONTEXT>,
): Tool<CONTEXT> {
  return tool;
}

// key fix: Tool vs Tool<any>
export type ToolSet = Record<
  string,
  (Tool<never> | Tool<any>) & Pick<Tool<any>, 'execute'>
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

type T4 = InferToolContext<(typeof mixedTools)['weather']>;
type T5 = InferToolContext<(typeof mixedTools)['calculator']>;
type T3 = InferToolSetContext<typeof mixedTools>;

// if `{}` is not assignable, the context has at least one required key
type HasRequiredKey<CONTEXT> = {} extends CONTEXT ? false : true;

type T1 = HasRequiredKey<{ a: string }>;
type T2 = HasRequiredKey<{}>;

type ContextParameter<TOOLS extends ToolSet> = {
  tools?: TOOLS;
} & (HasRequiredKey<InferToolSetContext<TOOLS>> extends true
  ? { context: InferToolSetContext<TOOLS> }
  : { context?: never });

declare function inferA<TOOLS extends ToolSet = ToolSet>(
  options: ContextParameter<TOOLS>,
): void;

const mixedTools = {
  weather: tool({
    contextSchema: schema<{ weatherApiKey: string }>(),
    execute: context => {
      return { weatherApiKey: context.weatherApiKey };
    },
  }),
  calculator: tool({}),
};

// no tools, no context
inferA({});

// tool without context
inferA({
  tools: {
    calculator: tool({}),
  },
});

// mixed tools with context defined externally, no context
// @ts-expect-error - context is required
inferA({
  tools: mixedTools,
});

// mixed tools with context defined externally, empty context
inferA({
  tools: mixedTools,
  // @ts-expect-error - hoisted tools preserve the required weatherApiKey
  context: {},
});

// mixed tools with context defined inline, empty context
inferA({
  tools: {
    weather: tool({
      contextSchema: schema<{ weatherApiKey: string }>(),
    }),
    calculator: tool({}),
  },
  // @ts-expect-error - inline tools should also require weatherApiKey
  context: {},
});

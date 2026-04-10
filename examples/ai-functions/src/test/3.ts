// This file is intentionally red until the generateText inline-tools
// inference bug is fixed. Compile it directly to confirm the current
// implementation still accepts `context: {}` for inline tool objects.

type Context = Record<string, unknown>;

type Schema<T> = {
  readonly __type?: T;
};

const schema = <T>(): Schema<T> => ({});

type Tool<CONTEXT extends Context = Record<never, never>> = {
  contextSchema?: Schema<CONTEXT>;
};

type InferToolContext<TOOL extends Tool<any>> =
  TOOL extends Tool<infer CONTEXT> ? CONTEXT : never;

export function tool<CONTEXT extends Context>(
  tool: Tool<CONTEXT>,
): Tool<CONTEXT> {
  return tool;
}

// key fix: Tool vs Tool<any>
export type ToolSet = Record<string, Tool>;

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
}): void;

const mixedTools = {
  weather: tool({
    contextSchema: schema<{ weatherApiKey: string }>(),
  }),
  calculator: tool({}),
};

inferA({
  tools: mixedTools,
  // @ts-expect-error - hoisted tools preserve the required weatherApiKey
  context: {},
});

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

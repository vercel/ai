import { FlexibleSchema } from 'ai';
import { run } from '../lib/run';
import { z } from 'zod';

interface Tool<INPUT = any, CONTEXT = any> {
  inputSchema: FlexibleSchema<INPUT>;
  contextSchema: FlexibleSchema<CONTEXT>;
  execute: (input: NoInfer<INPUT>, context: NoInfer<CONTEXT>) => unknown;
}

function tool<INPUT, CONTEXT>(options: {
  inputSchema: FlexibleSchema<INPUT>;
  contextSchema: FlexibleSchema<CONTEXT>;
  execute: (input: NoInfer<INPUT>, context: NoInfer<CONTEXT>) => unknown;
}) {
  return options;
}

type InferToolInput<TOOL extends Tool> =
  TOOL extends Tool<infer INPUT, any> ? INPUT : never;
type InferToolContext<TOOL extends Tool> =
  TOOL extends Tool<any, infer CONTEXT> ? CONTEXT : never;

export type ToolSet = Record<string, Tool<any, any>>;

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

// should be a union of all the context types of the tools
type InferToolSetContext<TOOLS extends ToolSet> = UnionToIntersection<
  {
    [K in keyof TOOLS]: InferToolContext<TOOLS[K]>;
  }[keyof TOOLS]
>;

// TODO prepareStep
function executeTool<
  TOOLS extends ToolSet,
  CONTEXT extends InferToolSetContext<TOOLS> & Record<string, unknown>,
>({
  tools,
  toolName,
  input,
  context,
}: {
  tools: TOOLS;
  toolName: keyof TOOLS;
  input: InferToolInput<TOOLS[typeof toolName]>;
  context: CONTEXT;
  prepareStep: (context: CONTEXT) => void;
}) {
  const tool = tools[toolName];
  return tool.execute(input, context);
}

run(async () => {
  const tool1 = tool({
    inputSchema: z.object({ input1: z.string() }),
    contextSchema: z.object({ context1: z.number() }),
    execute: async ({ input1 }, { context1 }) => {
      console.log(input1, context1);
    },
  });

  const tool2 = tool({
    inputSchema: z.object({ input2: z.number() }),
    contextSchema: z.object({ context2: z.string() }),
    execute: async ({ input2 }, { context2 }) => {
      console.log(input2, context2);
    },
  });

  executeTool({
    tools: {
      tool1,
      tool2,
    },
    toolName: 'tool1',
    input: { input1: 'Hello' },
    context: { context1: 1, context2: 'world', somethingElse: 'context' },
    prepareStep: context => {
      console.log(context);
    },
  });
});

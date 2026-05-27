import {
  type ModelMessage,
  Output,
  ToolLoopAgent,
  type FlexibleSchema,
  type InferToolSetContext,
  type LanguageModel,
  type OutputInterface,
  type Tool,
  type ToolSet,
  type ToolExecutionOptions,
} from 'ai';

export function subagent<
  INPUT,
  TOOLS extends ToolSet = {},
  OUTPUT extends OutputInterface = OutputInterface<string, string, never>,
>({
  model,
  description,
  instructions,
  tools,
  prompt,
  inputSchema,
  output = Output.text() as unknown as OUTPUT,
  toolsContext,
}: {
  model: LanguageModel;
  description: string;
  tools: TOOLS;
  toolsContext?: InferToolSetContext<TOOLS>;
  inputSchema: FlexibleSchema<INPUT>;
  output?: OUTPUT;
  instructions?: string | ((options: INPUT) => string);
  prompt:
    | string
    | Array<ModelMessage>
    | ((
        input: INPUT,
        options: ToolExecutionOptions<never>,
      ) => string | Array<ModelMessage>);
}): Tool<INPUT, OUTPUT> {
  const agent = new ToolLoopAgent({
    model,
    tools,
    toolsContext,
    output,
    callOptionsSchema: inputSchema,
    prepareCall: ({ options, ...rest }: any) => ({
      ...rest,
      instructions:
        typeof instructions === 'function'
          ? instructions(options)
          : instructions,
    }),
  } as any);

  return {
    description,
    inputSchema,
    execute: async (input: INPUT, options: ToolExecutionOptions<never>) => {
      const result = await agent.generate({
        prompt: typeof prompt === 'function' ? prompt(input, options) : prompt,
        options: input as any,
      });
      return result.output;
    },
  } as unknown as Tool<INPUT, OUTPUT>;
}

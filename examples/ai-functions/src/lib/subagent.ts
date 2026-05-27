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
  instructions: string | ((options: INPUT) => string);
  prompt:
    | string
    | Array<ModelMessage>
    | ((options: INPUT) => string | Array<ModelMessage>);
}): Tool<INPUT, OUTPUT> {
  const agent = new ToolLoopAgent({
    model,
    tools,
    toolsContext,
    output,
    callOptionsSchema: inputSchema,
    prepareCall: ({ options, ...rest }: any) => ({
      ...rest,
      prompt: typeof prompt === 'function' ? prompt(options) : prompt,
      instructions:
        typeof instructions === 'function'
          ? instructions(options)
          : instructions,
    }),
  } as any);

  return {
    description,
    inputSchema,
    execute: async (options: INPUT) => {
      const result = await agent.generate({
        prompt: '',
        options: options as any,
      });
      return result.output;
    },
  } as unknown as Tool<INPUT, OUTPUT>;
}

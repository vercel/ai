import {
  tool,
  ToolLoopAgent,
  type ToolSet,
  type FlexibleSchema,
  type InferToolSetContext,
  type LanguageModel,
  type Tool,
} from 'ai';

export function subagent<INPUT, TOOLS extends ToolSet = {}>({
  model,
  description,
  instructions,
  tools,
  prompt,
  inputSchema,
  toolsContext,
}: {
  model: LanguageModel;
  description: string;
  tools: TOOLS;
  toolsContext?: InferToolSetContext<TOOLS>;
  inputSchema: FlexibleSchema<INPUT>;
  instructions: string | ((options: INPUT) => string);
  prompt: string | ((options: INPUT) => string);
}): Tool<INPUT, string> {
  const agent = new ToolLoopAgent({
    model,
    tools,
    toolsContext,
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

  return tool({
    description,
    inputSchema,
    execute: async options => {
      const result = await agent.generate({
        prompt: '',
        options: options as any,
      });
      return result.text;
    },
  });
}

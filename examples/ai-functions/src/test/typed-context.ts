import { run } from '../lib/run';

interface Tool<CONTEXT> {
  execute: (context: CONTEXT) => Promise<void>;
}

export type ToolSet<CONTEXT> = Record<string, Tool<CONTEXT>>;

function executeTool<CONTEXT, TOOLS extends ToolSet<CONTEXT>>({
  tools,
  toolName,
  context,
}: {
  tools: TOOLS;
  toolName: keyof TOOLS;
  context: CONTEXT;
}) {
  return tools[toolName].execute(context);
}

run(async () => {
  const tool1: Tool<{ name: string }> = {
    execute: async context => {
      console.log(context);
    },
  };

  const tool2: Tool<{ age: number }> = {
    execute: async context => {
      console.log(context);
    },
  };

  executeTool({
    tools: {
      tool1,
      tool2,
    },
    toolName: 'tool1',
    context: { name: 'John', age: 30 },
  });
});

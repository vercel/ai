import { openai } from '@ai-sdk/openai';
import { CoreToolCallUnion, CoreToolResultUnion, generateText, tool } from 'ai';
import { z } from 'zod';

const tool1 = tool({
  description: 'Greets the user',
  parameters: z.object({ name: z.string() }),
  execute: async ({ name }) => `Hello, ${name}!`,
});

const tool2 = tool({
  description: 'Tells the user their age',
  parameters: z.object({ age: z.number() }),
  execute: async ({ age }) => `You are ${age} years old!`,
});

const toolSet = {
  firstTool: tool1,
  secondTool: tool2,
};

type ToolSet = typeof toolSet;
type ToolCall = CoreToolCallUnion<ToolSet>;
type ToolResult = CoreToolResultUnion<ToolSet>;

async function callLLM(toolSet: ToolSet): Promise<{
  toolCalls: Array<ToolCall>;
  toolResults: Array<ToolResult>;
}> {
  const result = await generateText({
    model: openai('gpt-4o'),
    tools: toolSet,
    prompt: '...',
  });

  return {
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
  };
}

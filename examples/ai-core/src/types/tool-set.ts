import { openai } from '@ai-sdk/openai';
import { CoreToolCallUnion, CoreToolResultUnion, generateText, tool } from 'ai';
import { z } from 'zod';

const myFirstTool = tool({
  description: 'Greets the user',
  parameters: z.object({ name: z.string() }),
  execute: async ({ name }) => `Hello, ${name}!`,
});

const mySecondTool = tool({
  description: 'Tells the user their age',
  parameters: z.object({ age: z.number() }),
  execute: async ({ age }) => `You are ${age} years old!`,
});

const myToolSet = {
  firstTool: myFirstTool,
  secondTool: mySecondTool,
};

type MyToolSet = typeof myToolSet;
type MyToolCall = CoreToolCallUnion<MyToolSet>;
type MyToolResult = CoreToolResultUnion<MyToolSet>;

async function callLLM(toolSet: MyToolSet): Promise<{
  text: string;
  toolCalls: Array<MyToolCall>;
  toolResults: Array<MyToolResult>;
}> {
  return generateText({
    model: openai('gpt-4o'),
    tools: toolSet,
    prompt: '...',
  });
}

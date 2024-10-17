import { CoreToolCallUnion, CoreToolResultUnion, tool } from 'ai';
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

// inferred tool call type:
type ToolCall = CoreToolCallUnion<typeof toolSet>;

// inferred tool result type:
type ToolResult = CoreToolResultUnion<typeof toolSet>;

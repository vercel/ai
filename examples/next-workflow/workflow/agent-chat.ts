import { anthropic } from '@ai-sdk/anthropic';
import { WorkflowAgent, type ModelCallStreamPart } from '@ai-sdk/workflow';
import {
  convertToModelMessages,
  type UIMessage,
  type ToolCallRepairFunction,
} from 'ai';
import { getWritable } from 'workflow';
import { z } from 'zod';

// ============================================================================
// Tool step functions
// ============================================================================

async function getWeather(input: { city: string }): Promise<{
  city: string;
  temperature: number;
  unit: string;
  condition: string;
}> {
  'use step';
  const hash = input.city
    .toLowerCase()
    .split('')
    .reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const temperature = 40 + (hash % 60);
  const conditions = [
    'sunny',
    'cloudy',
    'rainy',
    'snowy',
    'windy',
    'partly cloudy',
  ];
  return {
    city: input.city,
    temperature,
    unit: 'fahrenheit',
    condition: conditions[hash % conditions.length],
  };
}

async function calculate(input: {
  expression: string;
}): Promise<{ expression: string; result: number }> {
  'use step';
  const translated = input.expression.replace(/\s/g, '').replace(/\^/g, '**');
  if (!/^[0-9+\-*/().]+$/.test(translated))
    throw new Error(`Invalid expression: ${input.expression}`);
  return {
    expression: input.expression,
    result: new Function(`return (${translated})`)() as number,
  };
}

async function deleteFileStep(input: {
  path: string;
}): Promise<{ deleted: string }> {
  'use step';
  console.log('[deleteFile] Deleting:', input.path);
  return { deleted: input.path };
}

// ============================================================================
// Tools and workflow
// ============================================================================

const tools = {
  getWeather: {
    description: 'Get the current weather for a city.',
    inputSchema: z.object({ city: z.string().describe('The city name') }),
    execute: getWeather,
  },
  calculate: {
    description: 'Evaluate a math expression.',
    inputSchema: z.object({
      expression: z.string().describe('The expression'),
    }),
    execute: calculate,
  },
  deleteFile: {
    description: 'Delete a file from the filesystem.',
    inputSchema: z.object({ path: z.string().describe('The file path') }),
    execute: deleteFileStep,
    needsApproval: true as const,
  },
};

const repairToolCall: ToolCallRepairFunction<typeof tools> = async ({
  toolCall,
}) => {
  'use step';
  return toolCall;
};

export async function chat(messages: UIMessage[]) {
  'use workflow';

  const modelMessages = await convertToModelMessages(messages);

  const agent = new WorkflowAgent({
    model: anthropic('claude-sonnet-4-20250514'),
    instructions:
      'You are a helpful assistant with access to weather, calculator, and file deletion tools. Always use the appropriate tool when the user asks to perform an action — never just say you will do it, actually call the tool. Keep responses concise.',
    tools,
  });

  const result = await agent.stream({
    messages: modelMessages,
    writable: getWritable<ModelCallStreamPart>(),
    experimental_repairToolCall: repairToolCall as any,
  });

  return { messages: result.messages };
}

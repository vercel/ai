import { run } from '../lib/run';
import { generateObject, generateText, Output, stepCountIs, tool } from 'ai';
import { z } from 'zod';

run(async () => {
  const result = await generateText({
    model: 'openai/gpt-4o',
    experimental_output: Output.object({
      schema: z.object({
        summary: z.string(),
        sentiment: z.enum(['positive', 'neutral', 'negative']),
      }),
    }),
    tools: {
      analyze: tool({
        description: 'Analyze data',
        inputSchema: z.object({
          data: z.string(),
        }),
        execute: async ({ data }) => {
          return { result: 'analyzed' };
        },
      }),
    },
    // Add at least 1 to your intended step count to account for structured output
    stopWhen: stepCountIs(3), // Now accounts for: tool call + tool result + structured output
    prompt: 'Analyze the data and provide a summary',
  });

});

import { openai } from '@ai-sdk/openai';
import { generateText, tool, ToolExecutionError } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

async function main() {
  try {
    const result = await generateText({
      model: openai('gpt-4o-mini', { structuredOutputs: true }),
      tools: {
        weather: tool({
          description: 'Get the weather in a location',
          parameters: z.object({
            location: z
              .string()
              .describe('The location to get the weather for'),
          }),
          execute: async ({ location }): Promise<{ temperature: number }> => {
            throw new Error('could not get weather');
          },
        }),
      },
      prompt: 'What is the weather in San Francisco?',
    });
  } catch (error) {
    if (ToolExecutionError.isInstance(error)) {
      console.error('Tool execution error: ' + error.message);
      console.error('Tool name: ' + error.toolName);
      console.error('Tool args: ' + JSON.stringify(error.toolArgs));
      console.error('Cause: ' + error.cause);
    } else {
      console.error('Unexpected error:');
      console.error(error);
    }
  }
}

main().catch(console.error);

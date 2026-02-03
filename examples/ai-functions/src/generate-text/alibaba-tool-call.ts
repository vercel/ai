import { alibaba } from '@ai-sdk/alibaba';
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: alibaba('qwen-plus'),
    prompt: 'What is the weather in Paris?',
    maxSteps: 3,
    tools: {
      getWeather: tool({
        description: 'Get the weather for a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get weather for'),
        }),
        execute: async ({ location }) => {
          const temps = { Paris: 18, Tokyo: 24, London: 15 };
          const temp = temps[location as keyof typeof temps] ?? 20;
          return {
            location,
            temperature: temp,
            unit: 'celsius',
            condition: 'sunny',
          };
        },
      }),
    },
  });

  console.log('Text:', result.text);
  console.log('\nTool calls:', result.toolCalls.length);
  result.toolCalls.forEach((call, i) => {
    console.log(`  ${i + 1}. ${call.toolName}:`, call.args);
  });
  console.log('\nTool results:', result.toolResults.length);
  result.toolResults.forEach((res, i) => {
    console.log(`  ${i + 1}. Result:`, res.result);
  });

  console.log('\nUsage:', result.usage);
  console.log('Steps:', result.steps.length);
  console.log('Finish reason:', result.finishReason);
});

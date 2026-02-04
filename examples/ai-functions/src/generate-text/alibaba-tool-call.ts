import { alibaba } from '@ai-sdk/alibaba';
import { generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: alibaba('qwen-plus'),
    prompt: 'What is the weather in Paris?',
    stopWhen: stepCountIs(5),
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

  // Show all tool calls across all steps
  let totalToolCalls = 0;
  let totalToolResults = 0;

  console.log('\nSteps:');
  result.steps.forEach((step, i) => {
    console.log(`\nStep ${i + 1}:`);

    if (step.toolCalls && step.toolCalls.length > 0) {
      console.log(`  Tool calls: ${step.toolCalls.length}`);
      step.toolCalls.forEach(call => {
        totalToolCalls++;
        if (!call.dynamic) {
          console.log(`    - ${call.toolName}:`, call.input);
        }
      });
    }

    if (step.toolResults && step.toolResults.length > 0) {
      console.log(`  Tool results: ${step.toolResults.length}`);
      step.toolResults.forEach(result => {
        totalToolResults++;
        if (!result.dynamic) {
          console.log(`    - Result:`, result.output);
        }
      });
    }

    if (step.text) {
      console.log(`  Text: ${step.text}`);
    }
  });

  console.log(`\nTotal tool calls: ${totalToolCalls}`);
  console.log(`Total tool results: ${totalToolResults}`);
  console.log('\nUsage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});

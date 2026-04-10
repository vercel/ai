import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateText, stepCountIs, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { run } from '../../lib/run';

const conditions = [
  { name: 'sunny', minTemperature: -5, maxTemperature: 35 },
  { name: 'snowy', minTemperature: -10, maxTemperature: 0 },
  { name: 'rainy', minTemperature: 0, maxTemperature: 15 },
  { name: 'cloudy', minTemperature: 5, maxTemperature: 25 },
];

run(async () => {
  const result = await generateText({
    model: bedrockAnthropic('us.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    stopWhen: stepCountIs(5),
    onStepFinish: step => {
      console.log(`\n=== Step Response ===`);
      console.dir(step.response.body, { depth: Infinity });
    },
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        inputExamples: [
          { input: { location: 'San Francisco' } },
          { input: { location: 'London' } },
        ],
        execute: async ({ location }) => {
          const condition =
            conditions[Math.floor(Math.random() * conditions.length)];
          return {
            location,
            condition: condition.name,
            temperature:
              Math.floor(
                Math.random() *
                  (condition.maxTemperature - condition.minTemperature + 1),
              ) + condition.minTemperature,
          };
        },
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.log('\n=== Final Result ===');
  console.log('Text:', result.text);
});

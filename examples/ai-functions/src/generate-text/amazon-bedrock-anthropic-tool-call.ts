import { bedrockAnthropic } from '@ai-sdk/amazon-bedrock/anthropic';
import { generateText, tool } from 'ai';
import 'dotenv/config';
import { z } from 'zod';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: bedrockAnthropic('us.anthropic.claude-3-5-sonnet-20241022-v2:0'),
    tools: {
      weather: tool({
        description: 'Get the weather in a location',
        inputSchema: z.object({
          location: z.string().describe('The location to get the weather for'),
        }),
        execute: async ({ location }) => ({
          location,
          temperature: 72 + Math.floor(Math.random() * 21) - 10,
        }),
      }),
    },
    prompt: 'What is the weather in San Francisco?',
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
});

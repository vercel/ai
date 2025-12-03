import { bedrock } from '@ai-sdk/amazon-bedrock';
import { Output, stepCountIs, streamText } from 'ai';
import z from 'zod';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const { partialOutputStream } = streamText({
    model: bedrock('us.anthropic.claude-3-5-sonnet-20241022-v2:0'),
    stopWhen: stepCountIs(20),
    output: Output.array({
      element: z.object({
        location: z.string(),
        temperature: z.number(),
        condition: z.string(),
      }),
    }),
    tools: { weather: weatherTool },
    prompt: 'What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  for await (const partialOutput of partialOutputStream) {
    console.clear();
    console.log(partialOutput);
  }
});

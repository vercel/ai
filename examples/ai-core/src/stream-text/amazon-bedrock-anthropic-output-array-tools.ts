import { bedrock } from '@ai-sdk/amazon-bedrock';
import { Output, stepCountIs, streamText } from 'ai';
import z from 'zod';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const { fullStream } = streamText({
    model: bedrock('global.anthropic.claude-sonnet-4-5-20250929-v1:0'),
    headers: {
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
    },
    stopWhen: stepCountIs(20),
    output: Output.array({
      element: z.object({
        location: z.string(),
        temperature: z.number(),
        condition: z.string(),
      }),
    }),

    toolChoice: 'required',
    tools: { weather: weatherTool },
    prompt:
      'First, you must answer this questions: "What is 2+2". Then, answer: What is the weather in San Francisco, London, Paris, and Berlin?',
  });

  for await (const part of fullStream) {
    console.log(part);
  }
});

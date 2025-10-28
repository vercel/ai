import { anthropic } from '@ai-sdk/anthropic';
import { Output, stepCountIs, streamText } from 'ai';
import z from 'zod';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: anthropic('claude-haiku-4-5-20251001'),
    headers: {
      'anthropic-beta': 'fine-grained-tool-streaming-2025-05-14',
    },
    stopWhen: stepCountIs(1),
    includeRawChunks: true,
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

  await saveRawChunks({ result, filename: 'anthropic-output-array-tools' });
});

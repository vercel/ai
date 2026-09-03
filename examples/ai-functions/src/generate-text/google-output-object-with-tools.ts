import { google } from '@ai-sdk/google';
import { generateText, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { print } from '../lib/print';
import { run } from '../lib/run';
import { weatherTool } from '../tools/weather-tool';

run(async () => {
  const result = await generateText({
    model: google('gemini-2.5-flash'),
    stopWhen: stepCountIs(10),
    output: Output.object({
      schema: z.object({
        summary: z
          .string()
          .describe('A brief summary of the weather conditions'),
        locations: z.array(
          z.object({
            city: z.string(),
            temperature: z.number(),
            condition: z.string(),
          }),
        ),
      }),
    }),
    tools: { weather: weatherTool },
    toolChoice: 'required',
    prompt:
      'What is the weather in San Francisco and Tokyo? Use the weather tool to get the data, then provide a structured summary.',
  });

  print('Output:', result.output);
  print('Text:', result.text);
  print('Steps:', result.steps.length);
  print('Tool calls:', result.toolCalls);
  print('Tool results:', result.toolResults);
});

import { openai } from '@ai-sdk/openai';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: openai('gpt-4.1-mini'),
    prompt: 'What should I wear for the weather in San Francisco?',
    temperature: 0.7,
    tools: {
      weather: tool({
        description: 'Get the current weather for a location.',
        inputSchema: z.object({
          location: z.string(),
        }),
        execute: async ({ location }) => ({
          location,
          condition: 'foggy',
          temperature: 14,
        }),
      }),
    },
    stopWhen: isStepCount(2),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) {
        return {
          toolChoice: { type: 'tool', toolName: 'weather' },
          temperature: 0,
          maxOutputTokens: 100,
        };
      }

      return {
        activeTools: [],
        temperature: 0.7,
        maxOutputTokens: 200,
      };
    },
    onLanguageModelCallStart: ({ temperature, maxOutputTokens }) => {
      print('Step model call settings:', {
        temperature,
        maxOutputTokens,
      });
    },
  });

  print('Result:', result.text);
});

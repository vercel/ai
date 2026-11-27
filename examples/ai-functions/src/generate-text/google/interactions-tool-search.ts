import { google } from '@ai-sdk/google';
import { generateText, isStepCount, tool } from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: google.interactions('gemini-4-hydrogen'),
    tools: {
      tool_search: google.tools.toolSearch({}),
      convertCurrency: tool({
        description: 'Convert an amount between currencies at today’s rate.',
        inputSchema: z.object({
          amount: z.number(),
          from: z.string(),
          to: z.string(),
        }),
        providerOptions: {
          google: {
            deferLoading: true,
            shortDescription: 'Convert an amount between currencies.',
          },
        },
        execute: async ({ amount, from, to }) => ({
          amount,
          from,
          to,
          converted: amount * 11.2,
        }),
      }),
      getTimeZone: tool({
        description: 'Get the current time zone of a city.',
        inputSchema: z.object({ city: z.string() }),
        providerOptions: {
          google: {
            deferLoading: true,
            shortDescription: 'Look up a city’s time zone.',
          },
        },
        execute: async ({ city }) => ({ city, timeZone: 'Europe/Stockholm' }),
      }),
    },
    stopWhen: isStepCount(5),
    prompt: 'How much is 100 EUR in SEK?',
  });

  console.log('Final text:');
  console.log(result.text);
  console.log();
  console.log('Tool calls:', JSON.stringify(result.toolCalls, null, 2));
  console.log('Tool results:', JSON.stringify(result.toolResults, null, 2));
  console.log('Steps:', result.steps.length);
  console.log('Token usage:', result.usage);
});

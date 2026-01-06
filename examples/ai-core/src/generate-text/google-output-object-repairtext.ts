import { generateText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import 'dotenv/config';
import { run } from '../lib/run';

run(async () => {
  const { output } = await generateText({
    model: 'google/gemini-3-flash',
    tools: {
      google_search: google.tools.googleSearch({}),
    },
    output: Output.object({
      schema: z.object({
        recipe: z.object({
          name: z.string(),
          steps: z.array(z.string()),
        }),
      }),
    }),
    prompt: 'Generate a lasagna recipe.',

    experimental_repairText: async ({ text }) => {
      return text
        .replace(/^```(?:json)?\s*/, '') // Remove opening fence ( or ```)
        .replace(/\s*```$/, '') // Remove closing fence
        .trim();
    },
  });

  console.log(output);
});

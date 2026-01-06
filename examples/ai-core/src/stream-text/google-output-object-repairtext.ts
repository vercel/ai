import { streamText, Output } from 'ai';
import { google } from '@ai-sdk/google';
import { z } from 'zod';
import 'dotenv/config';
import { run } from '../lib/run';

run(async () => {
  const { partialOutputStream } = streamText({
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
    onError: ({ error }) => {
      console.error(error);
    },

    experimental_repairText: async ({ text }) => {
      return text
        .replace(/^```(?:json)?\s*/, '') // Remove opening fence
        .replace(/\s*```$/, '') // Remove closing fence
        .trim();
    },
  });

  for await (const partialObject of partialOutputStream) {
    console.log(partialObject);
  }
});

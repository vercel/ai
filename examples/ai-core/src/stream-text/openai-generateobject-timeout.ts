import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import 'dotenv/config';
import { z } from 'zod';

const DELAY = 2000;

const openaiWithCustomFetch = createOpenAI({
  fetch: async (url, options) => {
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    console.log(`Fetching ${url}`);
    console.time('Fetch duration');
    await delay(DELAY); // Simulate a network delay
    
    try {
      const result = await fetch(url, options);
      console.timeEnd('Fetch duration');
      console.log(`Fetched ${url}`);
      return result;
    } catch (error) {
      console.timeEnd('Fetch duration');
      console.error(`Error fetching ${url}:`, error);
      throw error;
    }
  },
});

const schema = z.object({
  events: z.array(
    z.object({
      date: z
        .string()
        .date()
        .transform(value => new Date(value)),
      event: z.string(),
    }),
  ),
});

async function runWithTimeout(timeout: number) {
  console.log(`\nTesting with timeout: ${timeout}ms`);
  try {
    console.time('Total operation time');
    const {
      object: { events },
    } = await generateObject({
      model: openaiWithCustomFetch('gpt-4-turbo'),
      schema,
      prompt: 'List 5 important events from the year 2000.',
      timeout: timeout,
    });

    console.timeEnd('Total operation time');
    console.log("Success! Events:");
    console.log(events);
  } catch (error) {
    console.timeEnd('Total operation time');
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      console.log('AbortError: The run was aborted due to timeout.');
    } else {
      console.error('An unexpected error occurred:', error);
    }
  }
}

async function main() {
  const timeouts = [1000, 2000, 10000];
  
  for (const timeout of timeouts) {
    await runWithTimeout(timeout);
  }
}

main().catch(console.error);
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

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

async function runWithTimeout(timeout: number) {
  console.log(`\nTesting with timeout: ${timeout}ms`);
  try {
    console.time('Total operation time');
    const result = await generateText({
      model: openaiWithCustomFetch('gpt-3.5-turbo'),
      prompt: 'Write a short story about a robot learning to love:\n\n',
      timeout: timeout,
    });

    console.timeEnd('Total operation time');
    console.log("Success! Story preview:");
    console.log(result.text.slice(0, 100) + "...");
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
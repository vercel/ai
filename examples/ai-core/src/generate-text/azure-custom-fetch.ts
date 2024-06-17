import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

const azure = createAzure({
  // example fetch wrapper that logs the URL:
  fetch: async (url, options) => {
    console.log(`Fetching ${url}`);
    const result = await fetch(url, options);
    console.log(`Fetched ${url}`);
    console.log();
    return result;
  },
});

async function main() {
  const result = await generateText({
    model: azure('v0-gpt-35-turbo'), // use your own deployment
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);

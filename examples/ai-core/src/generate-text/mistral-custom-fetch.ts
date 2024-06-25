import { createMistral } from '@ai-sdk/mistral';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

const mistral = createMistral({
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
    model: mistral('open-mistral-7b'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);

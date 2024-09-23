import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';

const azure = createAzure({
  // example fetch wrapper that logs the input to the API call:
  fetch: async (url, options) => {
    console.log('URL', url);
    console.log('Headers', JSON.stringify(options!.headers, null, 2));
    console.log(
      `Body ${JSON.stringify(JSON.parse(options!.body! as string), null, 2)}`,
    );
    return await fetch(url, options);
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

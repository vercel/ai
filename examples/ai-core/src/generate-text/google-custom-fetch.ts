import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { generateText } from 'ai';
import 'dotenv/config';

const google = createGoogleGenerativeAI({
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
    model: google('gemini-1.5-pro-latest'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);

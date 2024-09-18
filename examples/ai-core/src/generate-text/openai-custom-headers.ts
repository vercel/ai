import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  headers: {
    'custom-provider-header': 'value-1',
  },
  // fetch wrapper to log the headers:
  fetch: async (url, options) => {
    console.log('Headers', options?.headers);
    return fetch(url, options);
  },
});

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxTokens: 50,
    headers: {
      'custom-request-header': 'value-2',
    },
  });

  console.log(result.text);
}

main().catch(console.error);

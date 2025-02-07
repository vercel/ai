import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const openai = createOpenAI({
  baseURL: 'http://localhost:3000/v1',
  apiKey: 'abc',
});

async function main() {
  const { text, usage } = await generateText({
    model: openai('anthropic/claude-3-5-haiku-20241022'),
    prompt: 'Invent a new holiday and describe its traditions.',
    maxRetries: 0,
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);

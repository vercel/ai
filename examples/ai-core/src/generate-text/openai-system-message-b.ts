import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: openai('gpt-3.5-turbo'),
    system: 'You are a helpful assistant.',
    messages: [{ role: 'user', content: 'What is the capital of France?' }],
  });

  console.log(result.text);
}

main().catch(console.error);

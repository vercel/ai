import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

const togetherai = createOpenAI({
  name: 'togetherai',
  apiKey: process.env.TOGETHER_AI_API_KEY!,
  baseURL: 'https://api.together.xyz/v1/',
});

async function main() {
  const result = streamText({
    model: togetherai('google/gemma-2-9b-it'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

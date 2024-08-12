import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

// if you want to setup customized models, you can also just use a record:
const myModels = {
  'structuring-model': openai('gpt-4o-2024-08-06', {
    structuredOutputs: true,
  }),
  'smart-model': anthropic('claude-3-5-sonnet-20240620'),
} as const;

async function main() {
  const result = await streamText({
    model: myModels['structuring-model'],
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);

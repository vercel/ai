import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

const fireworks = createOpenAI({
  apiKey: process.env.FIREWORKS_API_KEY ?? '',
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

async function main() {
  const result = await streamText({
    model: fireworks('accounts/fireworks/models/firefunction-v1'),
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

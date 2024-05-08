import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

const groq = createOpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
});

async function main() {
  const result = await streamText({
    model: groq.chat('llama3-70b-8192'),
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

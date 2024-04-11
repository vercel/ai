import { experimental_streamText } from 'ai';
import { google } from '@ai-sdk/google';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await experimental_streamText({
    model: google.generativeAI('models/gemini-pro'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
}

main().catch(console.error);

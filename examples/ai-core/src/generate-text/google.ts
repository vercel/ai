import { experimental_generateText } from 'ai';
import { google } from '@ai-sdk/google';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await experimental_generateText({
    model: google.generativeAI('models/gemini-pro'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);

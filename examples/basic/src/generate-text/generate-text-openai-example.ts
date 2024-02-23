import { generateText } from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const text = await generateText({
    model: openai.chat({
      id: 'gpt-3.5-turbo',
      //   temperature: 0.7,
      //   maxGenerationTokens: 500,
    }),

    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
}

main().catch(console.error);

import { generateText } from 'ai/core';
import { OpenAI } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI();

async function main() {
  const result = await generateText({
    model: openai.chat('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main();

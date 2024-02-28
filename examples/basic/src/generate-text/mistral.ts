import { generateText } from 'ai/core';
import { mistral } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await generateText({
    model: mistral.chat({ id: 'mistral-small-latest' }),
    prompt: 'What is the best French cheese?',
  });

  console.log(result.text);
}

main();

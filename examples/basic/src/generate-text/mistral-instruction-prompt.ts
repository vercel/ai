import { generateText } from 'ai/function';
import { mistral } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

async function main() {
  const result = await generateText({
    model: mistral.chat({ id: 'mistral-small' }),
    prompt: 'What is the best French cheese?',
  });

  console.log(result.text);
}

main();

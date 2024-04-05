import { experimental_generateText } from 'ai';
import { OpenAI } from 'ai/openai';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI();

async function main() {
  const result = await experimental_generateText({
    model: openai.completion('gpt-3.5-turbo-instruct'),
    maxTokens: 1024,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);

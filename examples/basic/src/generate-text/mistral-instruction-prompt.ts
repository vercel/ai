import { generateText } from 'ai/function';
import { mistral, perplexity } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

const result = await generateText({
  model: mistral.chat({ id: 'mistral-small' }),
  prompt: 'What is the best French cheese?',
});

console.log(result.text);

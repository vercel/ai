import { generateText } from 'ai/function';
import { openai } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

const result = await generateText({
  model: openai.chat({
    id: 'gpt-3.5-turbo',
  }),

  prompt: 'Invent a new holiday and describe its traditions.',
});

console.log(result.text);

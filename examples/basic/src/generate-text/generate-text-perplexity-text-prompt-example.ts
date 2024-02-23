import { generateText } from 'ai/function';
import { perplexity } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

const text = await generateText({
  model: perplexity.chat({
    id: 'pplx-70b-online',
  }),

  prompt: 'What happened in San Francisco in this week?',
});

console.log(text);

import { streamText } from 'ai/function';
import { perplexity } from 'ai/provider';
import dotenv from 'dotenv';

dotenv.config();

const textStream = await streamText({
  model: perplexity.chat({
    id: 'pplx-70b-online',
  }),

  prompt: 'What happened in San Francisco in this week?',
});

for await (const textPart of textStream) {
  process.stdout.write(textPart);
}

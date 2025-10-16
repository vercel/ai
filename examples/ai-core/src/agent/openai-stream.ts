import { openai } from '@ai-sdk/openai';
import { BasicAgent } from 'ai';
import { run } from '../lib/run';

const agent = new BasicAgent({
  model: openai('gpt-5'),
  system: 'You are a helpful assistant.',
});

run(async () => {
  const result = agent.stream({
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }
});

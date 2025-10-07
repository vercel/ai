import { openai } from '@ai-sdk/openai';
import { Agent } from 'ai';
import { run } from '../lib/run';

const agent = new Agent({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
  onFinish(event) {
    console.dir(event, { depth: Infinity });
  },
});

run(async () => {
  await agent.generate({
    prompt: 'Invent a new holiday and describe its traditions.',
  });
});

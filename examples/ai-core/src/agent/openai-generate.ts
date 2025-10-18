import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { run } from '../lib/run';

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  system: 'You are a helpful assistant.',
});

run(async () => {
  const { text } = await agent.generate({
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
});

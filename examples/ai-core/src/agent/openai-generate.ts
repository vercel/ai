import { openai } from '@ai-sdk/openai';
import { Experimental_Agent as Agent } from 'ai';
import 'dotenv/config';

async function main() {
  const agent = new Agent({
    model: openai('gpt-4o'),
    system: 'You are a helpful assistant.',
  });

  const { text, usage } = await agent.generate({
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(text);
  console.log();
  console.log('Usage:', usage);
}

main().catch(console.error);

import { openai } from '@ai-sdk/openai';
import { Experimental_Agent as Agent } from 'ai';
import 'dotenv/config';

async function main() {
  const agent = new Agent({
    model: openai('gpt-3.5-turbo'),
    system: 'You are a helpful assistant.',
  });

  const result = agent.stream({
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

import { openai } from '@ai-sdk/openai';
import { Agent } from 'ai';
import 'dotenv/config';

async function main() {
  const agent = new Agent({
    model: openai('gpt-5'),
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

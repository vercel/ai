import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: azure('gpt-4o'), // use your own deployment
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

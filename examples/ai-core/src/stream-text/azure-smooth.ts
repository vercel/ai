import { azure } from '@ai-sdk/azure';
import { smoothStream, streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: azure('gpt-4.1-mini'), // use your own deployment
    prompt: 'Invent a new holiday and describe its traditions.',
    experimental_transform: smoothStream(),
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

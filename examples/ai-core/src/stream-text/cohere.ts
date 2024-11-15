import { cohere } from '@ai-sdk/cohere';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: cohere('command-r-plus'),
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

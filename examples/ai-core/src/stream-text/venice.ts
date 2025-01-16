import { venice } from '@ai-sdk/venice';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: venice('llama-3.3-70b'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result);
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error); 
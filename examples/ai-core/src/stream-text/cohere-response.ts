import 'dotenv/config';
import { cohere } from '@ai-sdk/cohere';
import { streamText } from 'ai';

async function main() {
  const result = streamText({
    model: cohere('command-r-plus'),
    maxTokens: 512,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log(JSON.stringify(await result.response, null, 2));
}

main().catch(console.error);

import { vercel } from '@ai-sdk/vercel';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: vercel('v0-1.0-md'),
    prompt: 'Invent a new holiday and describe its traditions.',
    onError: error => {
      console.error(error);
    },
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

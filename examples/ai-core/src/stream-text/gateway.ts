import { gateway } from '@ai-sdk/gateway';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: gateway('xai/grok-3-beta'),
    prompt: 'Invent a new holiday and describe its traditions.',
    onError: (error: unknown) => {
      console.error(error);
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

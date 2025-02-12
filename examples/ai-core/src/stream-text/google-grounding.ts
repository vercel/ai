import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-2.0-flash-exp', { useSearchGrounding: true }),
    prompt: 'List the top 5 San Francisco news from the past week.',
  });

  for await (const fullStepText of result.fullStream) {
    if (fullStepText.type === 'text-delta') {
      process.stdout.write(fullStepText.textDelta);
    }

    if (fullStepText.type === 'source') {
      console.log();
      console.log('Source:', fullStepText.source);
      console.log();
    }
  }

  // TODO sources promise
  console.log((await result.providerMetadata)?.google);
  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

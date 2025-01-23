import { google } from '@ai-sdk/google';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: google('gemini-2.0-flash-exp', {
      useSearchGrounding: true,
    }),
    prompt:
      'List the top 5 San Francisco news from the past week.' +
      'You must include the date of each article.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log((await result.experimental_providerMetadata)?.google);
  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

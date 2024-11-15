import { vertex } from '@ai-sdk/google-vertex';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: vertex('gemini-1.5-pro', {
      useSearchGrounding: true,
    }),
    prompt:
      'List the top 5 San Francisco news from the past week.' +
      'You must include the date of each article.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log((await result.experimental_providerMetadata)?.vertex);
  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
}

main().catch(console.error);

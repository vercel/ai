import { perplexity } from '@ai-sdk/perplexity';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: perplexity('sonar-pro'),
    prompt:
      'List the top 5 San Francisco news from the past week.' +
      'You must include the date of each article.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
  console.log(
    'Metadata:',
    JSON.stringify(await result.experimental_providerMetadata, null, 2),
  );
}

main().catch(console.error);

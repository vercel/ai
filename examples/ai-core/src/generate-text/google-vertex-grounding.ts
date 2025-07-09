import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: vertex('gemini-1.5-pro'),
    providerOptions: {
      google: {
        useSearchGrounding: true,
      },
    },
    prompt:
      'List the top 5 San Francisco news from the past week.' +
      'You must include the date of each article.',
  });

  console.log(result.text);
  console.log(result.providerMetadata?.google);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);

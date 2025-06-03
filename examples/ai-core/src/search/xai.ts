import 'dotenv/config';
import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';

async function main() {
  const result = await generateText({
    model: xai('grok-3-latest'),
    prompt: 'What are the latest developments in AI',
    providerOptions: {
      xai: {
        searchParameters: {
          mode: 'auto',
          returnCitations: true,
          maxSearchResults: 10,
        },
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

main().catch(console.error);

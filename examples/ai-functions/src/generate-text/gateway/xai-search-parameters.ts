import { generateText } from 'ai';
import { xaiSearchParameters } from '@ai-sdk/gateway';
import 'dotenv/config';

async function main() {
  const result = await generateText({
    model: 'xai/grok-4-fast-reasoning',
    prompt:
      'What were the major AI policy announcements this week? Cite your sources.',
    providerOptions: {
      xai: {
        searchParameters: xaiSearchParameters({
          mode: 'on',
          maxSearchResults: 5,
          sources: [{ type: 'web', country: 'US' }, { type: 'news' }],
        }),
      },
    },
  });

  console.log('Text:', result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log(
    'Provider metadata:',
    JSON.stringify(result.finalStep.providerMetadata, null, 2),
  );
}

main().catch(console.error);

import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: xai('grok-3-latest'),
    prompt: 'What are the latest developments in AI?',
    providerOptions: {
      xai: {
        searchParameters: {
          mode: 'auto',
          returnCitations: true,
          maxSearchResults: 5,
        },
      },
    },
  });

  console.log(result.text);
  console.log();
  console.log('Sources:', result.sources);
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);

  for (const source of result.sources) {
    if (source.sourceType === 'url') {
      console.log('Source ID:', source.id);
      console.log('URL:', source.url);
      console.log();
    }
  }
});

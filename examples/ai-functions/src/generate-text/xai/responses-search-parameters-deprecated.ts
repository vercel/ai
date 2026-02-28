import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.responses('grok-4-fast'),
    prompt: 'What happened in AI this week? Summarize with sources.',
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

  console.log('Text:', result.text);
  console.log('Warnings:', result.warnings);
  console.log();
  console.log('Sources:');
  for (const content of result.content) {
    if (content.type === 'source' && content.sourceType === 'url') {
      console.log(`- ${content.url}`);
    }
  }
  console.log();
  console.log('Finish reason:', result.finishReason);
  console.log('Usage:', result.usage);
});

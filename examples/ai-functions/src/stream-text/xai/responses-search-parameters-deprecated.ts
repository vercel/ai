import { xai } from '@ai-sdk/xai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
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

  console.log('Warnings:', await result.warnings);
  console.log();

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'source' && part.sourceType === 'url') {
      console.log(`\nSource: ${part.url}`);
    }
  }

  console.log();
});

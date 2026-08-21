import { spacexai } from '@ai-sdk/spacexai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: spacexai.responses('grok-4-1-fast-reasoning'),
    prompt: 'What documents do you have access to?',
    tools: {
      file_search: spacexai.tools.fileSearch({
        vectorStoreIds: ['collection_your-id-here'],
      }),
    },
  });

  for await (const part of result.textStream) {
    process.stdout.write(part);
  }
});

import { deepSeek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { run } from '../../lib/run';

const modelIds = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const;

run(async () => {
  for (const modelId of modelIds) {
    const { text } = await generateText({
      model: deepSeek(modelId),
      prompt:
        'Describe one practical use for a one-million-token context window.',
    });

    console.log(`${modelId}: ${text}`);
  }
});

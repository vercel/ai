import { neon as provider } from '@ai-sdk/neon';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: provider('databricks-claude-haiku-4-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});

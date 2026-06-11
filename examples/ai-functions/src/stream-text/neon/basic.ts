import { neon as provider } from '@ai-sdk/neon';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: provider('databricks-claude-haiku-4-5'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});

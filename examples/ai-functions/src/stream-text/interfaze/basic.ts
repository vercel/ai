import { interfaze } from '@ai-sdk/interfaze';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: interfaze('interfaze-beta'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result);
  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});

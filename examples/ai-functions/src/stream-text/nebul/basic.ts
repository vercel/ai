import { nebul } from '@ai-sdk/nebul';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: nebul('zai-org/GLM-5.3-Flash'),
    prompt: 'Tell a short story about a robot learning to paint.',
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.finishReason);
});

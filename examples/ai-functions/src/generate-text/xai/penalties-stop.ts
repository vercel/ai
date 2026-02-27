import { xai } from '@ai-sdk/xai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: xai.chat('grok-3-beta'),
    prompt:
      'write one short sentence about autumn and stop after the first sentence',
    frequencyPenalty: 0.2,
    presencePenalty: 0.1,
    stopSequences: ['. '],
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});

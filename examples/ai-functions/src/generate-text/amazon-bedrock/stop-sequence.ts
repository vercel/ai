import { amazonBedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: amazonBedrock('us.anthropic.claude-sonnet-5'),
    prompt: 'Write a short story and end it with the word END.',
    stopSequences: ['END'],
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
  console.log(
    'Stop sequence:',
    result.finalStep.providerMetadata?.bedrock?.stopSequence,
  );
});

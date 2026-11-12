import { inception } from '@ai-sdk/inception';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: inception('mercury-3'),
    reasoning: 'high',
    prompt:
      'A farmer has chickens and cows. There are 30 heads and 84 legs. How many of each animal are there?',
  });

  console.log(result.text);
  console.log('Token usage:', result.usage);
});

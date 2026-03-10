import { sarvam } from '@ai-sdk/sarvam';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: sarvam('sarvam-m'),
    prompt: 'Explain quantum computing simply',
  });

  console.log(result.text);
  console.log();
  console.log('Token usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
});

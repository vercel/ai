import { deepSeek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: deepSeek.responses('deepseek-flash'),
    prompt: 'Why is the sky blue? Answer in one sentence.',
    include: { responseBody: true },
  });

  print('Content:', result.content);
  print('Usage:', result.usage);
  print('Finish reason:', result.finishReason);

  return result;
});

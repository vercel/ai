import { deepseek } from '@ai-sdk/deepseek';
import { generateText } from 'ai';
import { print } from '../lib/print';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: deepseek('deepseek-chat'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  print('Content:', result.content);
  print('Usage:', result.usage);
  print('Finish reason:', result.finishReason);
});

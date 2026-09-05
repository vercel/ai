import { siliconflow } from '@ai-sdk/siliconflow';
import { generateText } from 'ai';
import { print } from '../../lib/print';
import { run } from '../../lib/run';

run(async () => {
  const result = await generateText({
    model: siliconflow('Qwen/Qwen2.5-7B-Instruct'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  print('Content:', result.content);
  print('Usage:', result.usage);
  print('Finish reason:', result.finishReason);
});

import { siliconflow } from '@ai-sdk/siliconflow';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: siliconflow('Qwen/Qwen2.5-7B-Instruct'),
    prompt: 'Write a short poem about AI.',
  });

  for await (const part of result.stream) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.textDelta);
    }
  }
});

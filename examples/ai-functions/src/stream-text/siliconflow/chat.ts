import { siliconflow } from '@ai-sdk/siliconflow';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: siliconflow('Qwen/Qwen3-32B'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  printFullStream({ result });
});

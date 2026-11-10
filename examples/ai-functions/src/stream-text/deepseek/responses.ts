import { deepSeek } from '@ai-sdk/deepseek';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: deepSeek.responses('deepseek-flash'),
    prompt: 'Why is the sky blue? Answer in one sentence.',
    includeRawChunks: true,
  });

  await printFullStream({ result });

  return result;
});

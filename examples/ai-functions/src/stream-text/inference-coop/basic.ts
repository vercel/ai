import { inferenceCoop } from '@ai-sdk/inference-coop';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: inferenceCoop('greenpt/deepseek-v4.1-flash'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  await printFullStream({ result });
});

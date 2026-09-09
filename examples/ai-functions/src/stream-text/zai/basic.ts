import { zai } from '@ai-sdk/zai';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: zai('glm-5.3'),
    prompt: 'Invent a new holiday and describe its traditions.',
    reasoning: 'high',
  });

  await printFullStream({ result });
});

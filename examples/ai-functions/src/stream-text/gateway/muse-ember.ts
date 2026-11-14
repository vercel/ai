import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  const result = streamText({
    model: 'meta/muse-ember',
    prompt: 'Explain why the sky is blue in two sentences.',
  });

  await printFullStream({ result });
});

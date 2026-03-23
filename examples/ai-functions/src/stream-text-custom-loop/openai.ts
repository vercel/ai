import { openai } from '@ai-sdk/openai';
import { experimental_streamModelCall as streamModelCall } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const { stream } = await streamModelCall({
    model: openai('gpt-5.4'),
    prompt: 'What is the capital of France?',
  });

  for await (const chunk of stream) {
    switch (chunk.type) {
      case 'text-delta':
        process.stdout.write(chunk.text);
        break;
    }
  }
});

import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';

run(async () => {
  const result = streamText({
    model: openai('gpt-5.1'),
    prompt: 'A ship is floating in the water. A ladder is attached to the ship. The tide comes in, and the water level rises. Will the ladder rungs go underwater?',

    providerOptions: {
        openai: {
            reasoningEffort: 'none',
        }
    }
  });

  printFullStream({ result });

  console.log();
  console.log('Token usage:', await result.usage);
  console.log('Finish reason:', await result.reasoningText);
});
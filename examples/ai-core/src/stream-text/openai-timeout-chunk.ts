import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { printFullStream } from '../lib/print-full-stream';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = streamText({
    model: openai('gpt-4o'),
    prompt: 'Write a short poem about the ocean.',
    // Per-chunk timeout: abort if no chunk is received for 5 seconds
    // This is useful for detecting stalled streams where the connection
    // is open but no data is flowing.
    timeout: { chunkMs: 5000 },
  });

  printFullStream({ result });

  print('Usage:', await result.usage);
  print('Finish reason:', await result.finishReason);
});

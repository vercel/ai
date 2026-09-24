import { openai } from '@ai-sdk/openai';
import { ToolLoopAgent } from 'ai';
import { run } from '../../lib/run';

const abortController = new AbortController();

const agent = new ToolLoopAgent({
  model: openai('gpt-4o'),
  instructions: 'You are a helpful assistant.',
  onAbort({ steps }) {
    // persist partial results here: onEnd is not called for aborted streams
    console.log(`\naborted after ${steps.length} step(s)`);
  },
  onEnd({ text }) {
    console.log(`\nfinished: ${text}`);
  },
});

run(async () => {
  const result = await agent.stream({
    prompt: 'Invent a new holiday and describe its traditions.',
    abortSignal: abortController.signal,
  });

  let characters = 0;

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);

    characters += textPart.length;

    if (characters > 100) {
      abortController.abort();
      break;
    }
  }
});

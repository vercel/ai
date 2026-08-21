import { spacexai } from '@ai-sdk/spacexai';
import { streamText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { stream } = streamText({
    model: spacexai.responses('grok-4-fast-non-reasoning'),
    tools: {
      web_search: spacexai.tools.webSearch(),
      x_search: spacexai.tools.xSearch(),
      code_execution: spacexai.tools.codeExecution(),
    },
    prompt: 'Can you research about Vercel AI Gateway?',
  });

  let toolCallCount = 0;

  for await (const event of stream) {
    if (event.type === 'tool-call') {
      toolCallCount++;
      console.log(
        `\n[Tool Call ${toolCallCount}] ${event.toolName}${event.providerExecuted ? ' (server-side)' : ' (client)'}`,
      );
    } else if (event.type === 'text-delta') {
      process.stdout.write(event.text);
    } else if (event.type === 'source' && event.sourceType === 'url') {
      console.log(`\n[Citation] ${event.url}`);
    }
  }

  console.log('\n');
});

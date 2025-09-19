import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import 'dotenv/config';

async function main() {
  try {
    const abortController = new AbortController();

    const { textStream } = streamText({
      model: openai('gpt-3.5-turbo'),
      prompt: 'Write a very long story about a robot learning to love. Include many details and make it at least 2000 words:\n\n',
      abortSignal: abortController.signal,
      onAbort: ({ steps, usage, totalUsage }) => {
        console.log('\n\nAborted!');
        console.log('Steps completed:', steps.length);
        console.log('Last step usage:', {
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          totalTokens: usage.totalTokens,
          reasoningTokens: usage.reasoningTokens,
          cachedInputTokens: usage.cachedInputTokens,
        });
        console.log('Total usage:', {
          inputTokens: totalUsage.inputTokens,
          outputTokens: totalUsage.outputTokens,
          totalTokens: totalUsage.totalTokens,
          reasoningTokens: totalUsage.reasoningTokens,
          cachedInputTokens: totalUsage.cachedInputTokens,
        });
      },
    });

    // Abort after 3 seconds to test real metrics in abort scenario
    setTimeout(() => {
      console.log('\n\nTriggering manual abort after 3 seconds...');
      abortController.abort();
    }, 3000);

    for await (const textPart of textStream) {
      process.stdout.write(textPart);
    }
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      console.log('\n\nAbortError: The run was aborted.');
    }
  }
}

main().catch(console.error);

import { generateText, tool, toolSearch } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  const abortController = new AbortController();
  let searchStarted!: () => void;
  const started = new Promise<void>(resolve => {
    searchStarted = resolve;
  });
  let receivedSignal: AbortSignal | undefined;

  const generation = generateText({
    model: new MockLanguageModelV4({
      doGenerate: async () => ({
        content: [
          {
            type: 'tool-call',
            toolCallId: 'search-call',
            toolName: 'search',
            input: JSON.stringify({ query: 'weather' }),
          },
        ],
        finishReason: { raw: 'tool-calls', unified: 'tool-calls' },
        usage: {
          inputTokens: {
            total: 1,
            noCache: 1,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 1, text: 1, reasoning: undefined },
        },
        warnings: [],
      }),
    }),
    prompt: 'Find a weather tool.',
    abortSignal: abortController.signal,
    tools: {
      search: toolSearch({
        search: async ({ abortSignal }) => {
          receivedSignal = abortSignal;
          searchStarted();

          await new Promise<void>(resolve => {
            abortSignal?.addEventListener('abort', () => resolve(), {
              once: true,
            });
          });

          return [];
        },
      }),
      weather: tool({
        deferLoading: true,
        description: 'Get the weather.',
        inputSchema: z.object({}),
      }),
    },
  });

  await started;
  abortController.abort(new Error('User stopped the generation.'));
  await generation.catch(() => undefined);

  console.log(
    'Search received a signal:',
    receivedSignal instanceof AbortSignal,
  );
  console.log('Search signal was aborted:', receivedSignal?.aborted);

  if (!receivedSignal?.aborted) {
    throw new Error('Expected the custom search signal to be aborted.');
  }
});

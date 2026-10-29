import { streamText, tool } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod/v4';
import { run } from '../../lib/run';

run(async () => {
  let attempt = 0;
  let toolExecutions = 0;

  const result = streamText({
    model: new MockLanguageModelV4({
      doStream: async () => ({
        stream:
          attempt++ === 0
            ? convertArrayToReadableStream([
                { type: 'text-start', id: 'attempt-1' },
                {
                  type: 'text-delta',
                  id: 'attempt-1',
                  delta: 'The first attempt started, ',
                },
                {
                  type: 'tool-call',
                  toolCallId: 'failed-attempt-tool',
                  toolName: 'recordEvent',
                  input: '{"event":"partial attempt"}',
                },
                {
                  type: 'error',
                  error: new Error('Provider stream disconnected'),
                },
              ])
            : convertArrayToReadableStream([
                { type: 'text-start', id: 'attempt-2' },
                {
                  type: 'text-delta',
                  id: 'attempt-2',
                  delta: 'and the retried step completed.',
                },
                { type: 'text-end', id: 'attempt-2' },
                {
                  type: 'finish',
                  finishReason: { raw: 'stop', unified: 'stop' },
                  usage: {
                    inputTokens: {
                      total: 5,
                      noCache: 5,
                      cacheRead: undefined,
                      cacheWrite: undefined,
                    },
                    outputTokens: {
                      total: 6,
                      text: 6,
                      reasoning: undefined,
                    },
                  },
                },
              ]),
      }),
    }),
    prompt: 'Explain stream retries in one sentence.',
    tools: {
      recordEvent: tool({
        inputSchema: z.object({ event: z.string() }),
        execute: async () => {
          toolExecutions++;
          return 'recorded';
        },
      }),
    },
    streamRetries: 1,
    onError: ({ error }) => {
      console.error('\nRecovering from stream error:', error);
    },
  });

  for await (const textPart of result.textStream) {
    process.stdout.write(textPart);
  }

  console.log(`\nModel calls: ${attempt}`);
  console.log('Failed-attempt tool executions:', toolExecutions);
  console.log('Finish reason:', await result.finishReason);
});

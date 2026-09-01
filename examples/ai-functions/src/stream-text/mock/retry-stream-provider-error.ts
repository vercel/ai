import { StreamProviderError, streamText } from 'ai';
import type { LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

let modelCallCount = 0;

const model = new MockLanguageModelV4({
  provider: 'anthropic.messages',
  doStream: async () => {
    modelCallCount++;

    const streamParts: LanguageModelV4StreamPart[] =
      modelCallCount === 1
        ? [
            { type: 'text-start', id: 'text-1' },
            { type: 'text-delta', id: 'text-1', delta: 'Partial output' },
            {
              type: 'error',
              error: {
                type: 'overloaded_error',
                message: 'Overloaded',
                statusCode: 529,
                isRetryable: true,
              },
            },
          ]
        : [
            { type: 'text-start', id: 'text-2' },
            {
              type: 'text-delta',
              id: 'text-2',
              delta: 'Complete output after retry',
            },
            { type: 'text-end', id: 'text-2' },
            {
              type: 'finish',
              finishReason: { raw: 'stop', unified: 'stop' },
              usage: {
                inputTokens: {
                  total: 3,
                  noCache: 3,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 4,
                  text: 4,
                  reasoning: undefined,
                },
              },
            },
          ];

    return {
      stream: convertArrayToReadableStream(streamParts),
    };
  },
});

run(async () => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = streamText({
      model,
      prompt: 'Write a short greeting.',
      onError: () => {
        // The full stream below handles the error part.
      },
    });

    let text = '';
    let streamError: StreamProviderError | undefined;

    for await (const part of result.stream) {
      if (part.type === 'text-delta') {
        text += part.text;
      } else if (
        part.type === 'error' &&
        StreamProviderError.isInstance(part.error)
      ) {
        streamError = part.error;
      }
    }

    if (streamError?.isRetryable && attempt < 2) {
      console.log(
        `Retrying after ${streamError.type ?? 'provider error'} (${streamError.statusCode ?? 'unknown status'})`,
      );
      continue;
    }

    if (streamError != null) {
      throw streamError;
    }

    // Buffer each attempt so partial output is not duplicated after a retry.
    console.log(text);
    return;
  }
});

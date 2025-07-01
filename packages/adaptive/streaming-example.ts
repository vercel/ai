import { adaptive } from './src/adaptive-provider';
import { ComparisonProvider } from './src/adaptive-chat-options';

// Utility to convert a ReadableStream to an async iterable
async function* readableStreamAsyncIterable<T>(
  stream: ReadableStream<T>,
): AsyncIterable<T> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

async function main() {
  const model = adaptive.chat();

  // Send a simple chat prompt and stream the response
  const { stream } = await model.doStream({
    prompt: [
      { role: 'user', content: [{ type: 'text', text: 'Tell me a joke.' }] },
    ],
    providerOptions: {
      comparisonProvider: {
        provider: 'anthropic',
        model: 'claude-4-sonnet',
      } satisfies ComparisonProvider,
    },
  });

  const textParts: string[] = [];

  for await (const part of readableStreamAsyncIterable(stream)) {
    if (part.type === 'text-delta') {
      process.stdout.write(part.delta);
      textParts.push(part.delta);
    }
    if (part.type === 'finish') {
      console.log('\n---');
      console.log(
        'Provider metadata (cost_saved):',
        part.providerMetadata?.adaptive?.cost_saved,
      );
      console.log('Finish reason:', part.finishReason);
      console.log('Usage:', part.usage);
    }

    if (part.type === 'response-metadata') {
      console.log('Response metadata:', part);
    }
  }
}

main();

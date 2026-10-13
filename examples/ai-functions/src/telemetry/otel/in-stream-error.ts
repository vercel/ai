import { LegacyOpenTelemetry } from '@ai-sdk/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { registerTelemetry, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { run } from '../../lib/run';

const sdk = new NodeSDK({ traceExporter: new ConsoleSpanExporter() });
sdk.start();
registerTelemetry(new LegacyOpenTelemetry());

run(async () => {
  try {
    const result = streamText({
      // Use a deterministic stream because live provider server errors are unpredictable.
      model: new MockLanguageModelV4({
        doStream: {
          stream: convertArrayToReadableStream([
            { type: 'error', error: new Error('Provider stream failed') },
            {
              type: 'finish',
              finishReason: { unified: 'error', raw: undefined },
              usage: {
                inputTokens: {
                  total: 7,
                  noCache: 7,
                  cacheRead: 0,
                  cacheWrite: 0,
                },
                outputTokens: { total: 3, text: 3, reasoning: 0 },
              },
            },
          ]),
        },
      }),
      prompt: 'Hi',
      onError: ({ error }) => console.error(error),
    });

    // Consume the finish chunk so spans include usage and end with ERROR status (2).
    await result.consumeStream();
  } finally {
    await sdk.shutdown();
  }
});

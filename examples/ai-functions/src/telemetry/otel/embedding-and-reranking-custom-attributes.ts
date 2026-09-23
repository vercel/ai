import { cohere } from '@ai-sdk/cohere';
import { OpenTelemetry } from '@ai-sdk/otel';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ConsoleSpanExporter } from '@opentelemetry/sdk-trace-node';
import { embed, embedMany, registerTelemetry, rerank } from 'ai';
import { run } from '../../lib/run';

const sdk = new NodeSDK({ traceExporter: new ConsoleSpanExporter() });
sdk.start();

registerTelemetry(
  new OpenTelemetry({
    enrichSpan: ({ runtimeContext }) => ({
      'app.request_id': runtimeContext?.requestId as string | undefined,
    }),
  }),
);

run(async () => {
  const runtimeContext = {
    requestId: 'req-123',
    userId: 'user-456',
  };
  const telemetry = {
    // Only requestId reaches the integration; userId remains local.
    includeRuntimeContext: { requestId: true },
  };

  try {
    await embed({
      model: cohere.embedding('embed-multilingual-v3.0'),
      value: 'sunny day at the beach',
      runtimeContext,
      telemetry,
    });

    await embedMany({
      model: cohere.embedding('embed-multilingual-v3.0'),
      values: ['sunny day at the beach', 'rainy afternoon in the city'],
      runtimeContext,
      telemetry,
    });

    await rerank({
      model: cohere.reranking('rerank-v3.5'),
      documents: ['sunny day at the beach', 'rainy afternoon in the city'],
      query: 'Where can I enjoy the sunshine?',
      runtimeContext,
      telemetry,
    });
  } finally {
    await sdk.shutdown();
  }
});

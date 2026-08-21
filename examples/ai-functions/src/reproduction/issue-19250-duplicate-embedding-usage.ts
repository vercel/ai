import { OpenTelemetry } from '@ai-sdk/otel';
import { node, tracing } from '@opentelemetry/sdk-node';
import { embed, embedMany, registerTelemetry } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';

type FinishedSpan = ReturnType<
  tracing.InMemorySpanExporter['getFinishedSpans']
>[number];

function summarizeEmbeddingSpans(spans: FinishedSpan[]) {
  const embeddingSpans = spans.filter(
    span => span.attributes['gen_ai.operation.name'] === 'embeddings',
  );

  return {
    spans: embeddingSpans.map(span => ({
      name: span.name,
      relationship: span.parentSpanContext ? 'child' : 'root',
      provider: span.attributes['gen_ai.provider.name'],
      model: span.attributes['gen_ai.request.model'],
      inputTokens: span.attributes['gen_ai.usage.input_tokens'],
    })),
    reportedInputTokens: embeddingSpans.reduce((sum, span) => {
      const usage = span.attributes['gen_ai.usage.input_tokens'];
      return sum + (typeof usage === 'number' ? usage : 0);
    }, 0),
  };
}

async function main() {
  const exporter = new tracing.InMemorySpanExporter();
  const provider = new node.NodeTracerProvider({
    spanProcessors: [new tracing.SimpleSpanProcessor(exporter)],
  });
  provider.register();
  registerTelemetry(new OpenTelemetry());

  const failures: string[] = [];

  const embedSpanStart = exporter.getFinishedSpans().length;
  const embedResult = await embed({
    model: new MockEmbeddingModelV4({
      provider: 'openai.embeddings',
      modelId: 'text-embedding-3-large',
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => [0.1, 0.2, 0.3]),
        usage: { tokens: values.length * 14 },
        warnings: [],
      }),
    }),
    value: 'hello world',
  });
  const embedSummary = summarizeEmbeddingSpans(
    exporter.getFinishedSpans().slice(embedSpanStart),
  );

  const embedManySpanStart = exporter.getFinishedSpans().length;
  const embedManyResult = await embedMany({
    model: new MockEmbeddingModelV4({
      provider: 'openai.embeddings',
      modelId: 'text-embedding-3-large',
      maxEmbeddingsPerCall: 2,
      doEmbed: async ({ values }) => ({
        embeddings: values.map(() => [0.1, 0.2, 0.3]),
        usage: { tokens: values.length * 14 },
        warnings: [],
      }),
    }),
    values: ['one', 'two', 'three'],
  });
  const embedManySummary = summarizeEmbeddingSpans(
    exporter.getFinishedSpans().slice(embedManySpanStart),
  );

  console.log(
    JSON.stringify(
      {
        embed: {
          actualInputTokens: embedResult.usage.tokens,
          ...embedSummary,
        },
        embedMany: {
          actualInputTokens: embedManyResult.usage.tokens,
          ...embedManySummary,
        },
      },
      null,
      2,
    ),
  );

  if (embedSummary.reportedInputTokens !== embedResult.usage.tokens) {
    failures.push(
      `embed reported ${embedSummary.reportedInputTokens} input tokens across embeddings spans for ${embedResult.usage.tokens} actual tokens`,
    );
  }

  if (embedManySummary.reportedInputTokens !== embedManyResult.usage.tokens) {
    failures.push(
      `embedMany reported ${embedManySummary.reportedInputTokens} input tokens across embeddings spans for ${embedManyResult.usage.tokens} actual tokens`,
    );
  }

  await provider.shutdown();

  if (failures.length > 0) {
    throw new Error(`ISSUE_19250_DUPLICATE_USAGE: ${failures.join('; ')}`);
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

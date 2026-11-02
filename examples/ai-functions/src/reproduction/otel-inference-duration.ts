import { OpenTelemetry } from '@ai-sdk/otel';
import { metrics, trace } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { generateText, registerTelemetry } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { run } from '../lib/run';

run(async () => {
  const spanExporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(spanExporter)],
  });
  trace.setGlobalTracerProvider(tracerProvider);
  registerTelemetry(new OpenTelemetry());

  const metricExporter = new InMemoryMetricExporter(
    AggregationTemporality.CUMULATIVE,
  );
  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: metricExporter,
        exportIntervalMillis: 60_000,
      }),
    ],
  });
  metrics.setGlobalMeterProvider(meterProvider);
  metrics.getMeter('control').createCounter('repro.control').add(1);

  try {
    await generateText({
      model: new MockLanguageModelV4({
        provider: 'openai.chat',
        modelId: 'test-model',
        doGenerate: async () => ({
          content: [{ type: 'text', text: 'hello' }],
          finishReason: { unified: 'stop', raw: 'stop' },
          usage: {
            inputTokens: { total: 2, noCache: 2, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          },
          warnings: [],
        }),
      }),
      prompt: 'hello',
      maxRetries: 0,
    });

    await tracerProvider.forceFlush();
    await meterProvider.forceFlush();

    const exportedMetrics = metricExporter
      .getMetrics()
      .flatMap(resource => resource.scopeMetrics)
      .flatMap(scope => scope.metrics);
    console.log('metric names:', [
      ...new Set(exportedMetrics.map(metric => metric.descriptor.name)),
    ]);
    console.dir(
      exportedMetrics.find(
        metric => metric.descriptor.name === 'gen_ai.client.inference.duration',
      ),
      { depth: null },
    );
    const span = spanExporter
      .getFinishedSpans()
      .find(span => span.attributes['gen_ai.operation.name'] === 'chat');
    console.log(
      'duration attribute present:',
      typeof span?.attributes['gen_ai.client.operation.duration'] === 'number',
    );
  } finally {
    await meterProvider.shutdown();
    await tracerProvider.shutdown();
  }
});

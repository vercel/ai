import { registerTelemetry } from 'ai';
import { OpenTelemetry } from '@ai-sdk/otel';
import { LangfuseSpanProcessor, ShouldExportSpan } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

registerTelemetry(new OpenTelemetry());

const shouldExportSpan: ShouldExportSpan = span => {
  return span.otelSpan.instrumentationScope.name !== 'next.js';
};

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  shouldExportSpan,
});

const tracerProvider = new NodeTracerProvider({
  spanProcessors: [langfuseSpanProcessor],
});

tracerProvider.register();

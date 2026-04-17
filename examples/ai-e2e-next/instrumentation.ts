import { registerTelemetryIntegration } from 'ai';
import { OpenTelemetryIntegration } from '@ai-sdk/otel';
import { LangfuseSpanProcessor, ShouldExportSpan } from '@langfuse/otel';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';

registerTelemetryIntegration(new OpenTelemetryIntegration());

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

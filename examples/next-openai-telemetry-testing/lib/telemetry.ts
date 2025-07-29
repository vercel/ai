import { metrics, trace } from '@opentelemetry/api';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';
import { MeterProvider } from '@opentelemetry/sdk-metrics';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-base';

// Create a tracer provider
const tracerProvider = new NodeTracerProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'ai-sdk-example',
  }),
});

// Create a meter provider for custom metrics
const meterProvider = new MeterProvider({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'ai-sdk-example',
  }),
});

// Register the providers
metrics.setGlobalMeterProvider(meterProvider);
trace.setGlobalTracerProvider(tracerProvider);

// Create meters and counters for AI operations
const meter = metrics.getMeter('ai-operations');
export const completionCounter = meter.createCounter('ai_completions_total', {
  description: 'Total number of AI completions',
});

export const completionLatency = meter.createHistogram('ai_completion_latency', {
  description: 'Latency of AI completions in milliseconds',
  unit: 'ms',
});

export const completionTokens = meter.createHistogram('ai_completion_tokens', {
  description: 'Number of tokens in AI completions',
});

// Create a tracer for AI operations
export const tracer = trace.getTracer('ai-operations');

// Helper function to record completion metrics
export function recordCompletion(latencyMs: number, tokens: number, status: 'success' | 'error') {
  completionCounter.add(1, { status });
  completionLatency.record(latencyMs, { status });
  completionTokens.record(tokens, { status });
} 
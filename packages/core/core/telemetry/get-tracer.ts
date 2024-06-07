import opentelemetry from '@opentelemetry/api';

// async to support dynamic imports / stubbing
export async function getTracer() {
  // TODO mock / test / noop support
  const tracer = opentelemetry.trace.getTracer('ai');

  return tracer;
}

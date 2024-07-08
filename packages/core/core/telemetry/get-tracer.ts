import opentelemetry from '@opentelemetry/api';
import { noopTracer } from './noop-tracer';

// async to support dynamic imports / stubbing
export async function getTracer({ isEnabled }: { isEnabled: boolean }) {
  if (!isEnabled) {
    return noopTracer;
  }

  // TODO mock / test support
  const tracer = opentelemetry.trace.getTracer('ai');

  return tracer;
}

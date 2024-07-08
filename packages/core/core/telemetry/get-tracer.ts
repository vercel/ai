import opentelemetry, { Tracer } from '@opentelemetry/api';
import { noopTracer } from './noop-tracer';

/**
 * Tracer variable for testing. Tests can set this to a mock tracer.
 */
let testTracer: Tracer | undefined = undefined;

export function setTestTracer(tracer: Tracer | undefined) {
  testTracer = tracer;
}

export function getTracer({ isEnabled }: { isEnabled: boolean }) {
  if (!isEnabled) {
    return noopTracer;
  }

  if (testTracer) {
    return testTracer;
  }

  return opentelemetry.trace.getTracer('ai');
}

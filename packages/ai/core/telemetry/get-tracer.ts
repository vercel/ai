import { Tracer, trace } from '@opentelemetry/api';
import { noopTracer } from './noop-tracer';

export function getTracer({ isEnabled, getTracer }: { isEnabled: boolean; getTracer?: () => Tracer }): Tracer {
  if (!isEnabled) {
    return noopTracer;
  }

  if (getTracer) {
    return getTracer();
  }

  return trace.getTracer('ai');
}

import { Attributes, Span, Tracer } from '@opentelemetry/api';

export function recordSpan<T>(
  tracer: Tracer,
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
) {
  return tracer.startActiveSpan(name, { attributes }, async span => {
    try {
      return await fn(span);
    } catch (error) {
      if (error instanceof Error) {
        span.recordException({
          name: error.name,
          message: error.message,
          stack: error.stack,
        });
      }
      span.setStatus(2 as any); // SpanStatus.ERROR

      throw error;
    } finally {
      span.end();
    }
  });
}

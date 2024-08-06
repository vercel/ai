import { Attributes, Span, Tracer, SpanStatusCode } from '@opentelemetry/api';

export function recordSpan<T>({
  name,
  tracer,
  attributes,
  fn,
  endWhenDone = true,
}: {
  name: string;
  tracer: Tracer;
  attributes: Attributes;
  fn: (span: Span) => Promise<T>;
  endWhenDone?: boolean;
}) {
  return tracer.startActiveSpan(name, { attributes }, async span => {
    try {
      const result = await fn(span);

      if (endWhenDone) {
        span.end();
      }

      return result;
    } catch (error) {
      try {
        if (error instanceof Error) {
          span.recordException({
            name: error.name,
            message: error.message,
            stack: error.stack,
          });
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message,
          });
        } else {
          span.setStatus({ code: SpanStatusCode.ERROR });
        }
      } finally {
        // always stop the span when there is an error:
        span.end();
      }

      throw error;
    }
  });
}

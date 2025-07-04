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
        recordErrorOnSpan(span, error);
      } finally {
        // always stop the span when there is an error:
        span.end();
      }

      throw error;
    }
  });
}

/**
 * Record an error on a span. If the error is an instance of Error, an exception event will be recorded on the span, otherwise
 * the span will be set to an error status.
 *
 * @param span - The span to record the error on.
 * @param error - The error to record on the span.
 */
export function recordErrorOnSpan(span: Span, error: unknown) {
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
}

import type { Span, Tracer } from '@opentelemetry/api';
import { expect, it, vi } from 'vitest';
import { recordSpan } from './record-span';

function createTracer() {
  const span = {
    end: vi.fn(),
    recordException: vi.fn(),
    setStatus: vi.fn(),
  } as unknown as Span;
  const tracer = {
    startActiveSpan: (
      _name: string,
      _options: unknown,
      fn: (span: Span) => unknown,
    ) => fn(span),
  } as unknown as Tracer;

  return { span, tracer };
}

it('does not end rejected spans when endWhenDone is false', async () => {
  const { span, tracer } = createTracer();

  await expect(
    recordSpan({
      name: 'test-span',
      tracer,
      attributes: {},
      endWhenDone: false,
      fn: async () => {
        throw new Error('test error');
      },
    }),
  ).rejects.toThrow('test error');

  expect(span.recordException).toHaveBeenCalledOnce();
  expect(span.setStatus).toHaveBeenCalledOnce();
  expect(span.end).not.toHaveBeenCalled();
});

it('ends rejected spans when endOnError is true', async () => {
  const { span, tracer } = createTracer();

  await expect(
    recordSpan({
      name: 'test-span',
      tracer,
      attributes: {},
      endWhenDone: false,
      endOnError: true,
      fn: async () => {
        throw new Error('test error');
      },
    }),
  ).rejects.toThrow('test error');

  expect(span.recordException).toHaveBeenCalledOnce();
  expect(span.setStatus).toHaveBeenCalledOnce();
  expect(span.end).toHaveBeenCalledOnce();
});

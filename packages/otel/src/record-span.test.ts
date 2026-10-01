import { APICallError } from '@ai-sdk/provider';
import type { Span } from '@opentelemetry/api';
import { RetryError } from 'ai';
import { describe, it, expect, beforeEach } from 'vitest';
import { recordSpan, recordErrorOnSpan } from './record-span';
import { MockTracer } from './mock-tracer';

describe('recordSpan', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should execute the function and return its result', async () => {
    const result = await recordSpan({
      name: 'test-span',
      tracer,
      attributes: { key: 'value' },
      fn: async () => 'test-result',
    });

    expect(result).toBe('test-result');
    expect(tracer.spans).toHaveLength(1);
    expect(tracer.spans[0].name).toBe('test-span');
    expect(tracer.spans[0].attributes).toEqual({ key: 'value' });
  });

  it('should end span when endWhenDone is true (default)', async () => {
    await recordSpan({
      name: 'test-span',
      tracer,
      attributes: {},
      fn: async () => 'result',
    });

    expect(tracer.spans).toHaveLength(1);
  });

  it('should not end span when endWhenDone is false', async () => {
    await recordSpan({
      name: 'test-span',
      tracer,
      attributes: {},
      fn: async () => 'result',
      endWhenDone: false,
    });

    expect(tracer.spans).toHaveLength(1);
  });

  it('should record error and end span on exception', async () => {
    const error = new Error('Test error');

    await expect(
      recordSpan({
        name: 'test-span',
        tracer,
        attributes: {},
        fn: async () => {
          throw error;
        },
      }),
    ).rejects.toThrow('Test error');

    expect(tracer.spans).toHaveLength(1);
    expect(tracer.spans[0].status).toEqual({
      code: 2, // ERROR
      message: 'Test error',
    });
    expect(tracer.spans[0].events).toHaveLength(1);
    expect(tracer.spans[0].events[0].name).toBe('exception');
  });

  it('should support async attributes', async () => {
    await recordSpan({
      name: 'test-span',
      tracer,
      attributes: Promise.resolve({ async: 'attribute' }),
      fn: async () => 'result',
    });

    expect(tracer.spans).toHaveLength(1);
    expect(tracer.spans[0].attributes).toEqual({ async: 'attribute' });
  });
});

describe('recordErrorOnSpan', () => {
  let tracer: MockTracer;

  beforeEach(() => {
    tracer = new MockTracer();
  });

  it('should record exception for Error instances', async () => {
    const error = new Error('Test error');

    await expect(
      recordSpan({
        name: 'test-span',
        tracer,
        attributes: {},
        fn: async (span: Span) => {
          recordErrorOnSpan(span, error);
          throw error;
        },
      }),
    ).rejects.toThrow('Test error');

    expect(tracer.spans[0].events).toHaveLength(2); // exception event + recordErrorOnSpan call
    expect(tracer.spans[0].status).toEqual({
      code: 2,
      message: 'Test error',
    });
  });

  it('should set error status for non-Error exceptions', async () => {
    await expect(
      recordSpan({
        name: 'test-span',
        tracer,
        attributes: {},
        fn: async (span: Span) => {
          recordErrorOnSpan(span, 'string error');
          throw 'string error';
        },
      }),
    ).rejects.toBe('string error');

    expect(tracer.spans[0].status).toEqual({
      code: 2,
    });
  });

  it('should record the HTTP status code from an API call error', () => {
    const span = tracer.startSpan('test-span');

    recordErrorOnSpan(
      span,
      new APICallError({
        message: 'Bad request',
        url: 'https://example.com',
        requestBodyValues: {},
        statusCode: 400,
      }),
    );

    expect(tracer.spans[0].attributes).toEqual({
      'http.response.status_code': 400,
    });
  });

  it('should record the HTTP status code from the last retry error', () => {
    const span = tracer.startSpan('test-span');

    recordErrorOnSpan(
      span,
      new RetryError({
        message: 'Retries exhausted',
        reason: 'maxRetriesExceeded',
        errors: [
          new APICallError({
            message: 'Too many requests',
            url: 'https://example.com',
            requestBodyValues: {},
            statusCode: 429,
          }),
        ],
      }),
    );

    expect(tracer.spans[0].attributes).toEqual({
      'http.response.status_code': 429,
    });
  });
});

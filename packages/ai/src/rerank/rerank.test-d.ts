import type { Context } from '@ai-sdk/provider-utils';
import { describe, it, expectTypeOf } from 'vitest';
import { MockRerankingModelV4 } from '../test/mock-reranking-model-v4';
import { rerank } from './rerank';

describe('runtimeContext', () => {
  it('defaults to Context when omitted', async () => {
    await rerank({
      model: new MockRerankingModelV4(),
      documents: ['hello'],
      query: 'hello',
      onStart: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
      },
      onEnd: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
      },
    });
  });

  it('infers the full context for callbacks while restricting telemetry keys', async () => {
    await rerank({
      model: new MockRerankingModelV4(),
      documents: ['hello'],
      query: 'hello',
      runtimeContext: { requestId: 'req-123', privateValue: 42 },
      telemetry: { includeRuntimeContext: { requestId: true } },
      onStart: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<{
          requestId: string;
          privateValue: number;
        }>();
      },
      onEnd: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<{
          requestId: string;
          privateValue: number;
        }>();
      },
    });
  });

  it('preserves context typing through deprecated aliases', async () => {
    await rerank({
      model: new MockRerankingModelV4(),
      documents: ['hello'],
      query: 'hello',
      runtimeContext: { requestId: 'req-123' },
      experimental_telemetry: { includeRuntimeContext: { requestId: true } },
      experimental_onStart: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<{ requestId: string }>();
      },
      experimental_onEnd: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<{ requestId: string }>();
      },
    });
  });

  it('rejects unknown telemetry keys', async () => {
    await rerank({
      model: new MockRerankingModelV4(),
      documents: ['hello'],
      query: 'hello',
      runtimeContext: { requestId: 'req-123' },
      telemetry: {
        includeRuntimeContext: {
          // @ts-expect-error Only keys of runtimeContext can be included.
          unknownKey: true,
        },
      },
    });
    await rerank({
      model: new MockRerankingModelV4(),
      documents: ['hello'],
      query: 'hello',
      runtimeContext: { requestId: 'req-123' },
      experimental_telemetry: {
        includeRuntimeContext: {
          // @ts-expect-error The deprecated alias uses the same context keys.
          unknownKey: true,
        },
      },
    });
  });
});

it('preserves document inference alongside runtime context', async () => {
  const result = await rerank({
    model: new MockRerankingModelV4(),
    documents: [{ title: 'hello' }],
    query: 'hello',
    runtimeContext: { requestId: 'req-123' },
  });
  expectTypeOf(result.originalDocuments).toEqualTypeOf<
    Array<{ title: string }>
  >();

  const explicit = await rerank<string>({
    model: new MockRerankingModelV4(),
    documents: ['hello'],
    query: 'hello',
  });
  expectTypeOf(explicit.originalDocuments).toEqualTypeOf<Array<string>>();
});

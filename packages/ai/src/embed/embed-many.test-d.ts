import type { Context } from '@ai-sdk/provider-utils';
import { describe, it, expectTypeOf } from 'vitest';
import { MockEmbeddingModelV4 } from '../test/mock-embedding-model-v4';
import { embedMany } from './embed-many';

describe('runtimeContext', () => {
  it('defaults to Context when omitted', async () => {
    await embedMany({
      model: new MockEmbeddingModelV4(),
      values: ['hello'],
      onStart: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
      },
      onEnd: ({ runtimeContext }) => {
        expectTypeOf(runtimeContext).toEqualTypeOf<Context>();
      },
    });
  });

  it('infers the full context for callbacks while restricting telemetry keys', async () => {
    await embedMany({
      model: new MockEmbeddingModelV4(),
      values: ['hello'],
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
    await embedMany({
      model: new MockEmbeddingModelV4(),
      values: ['hello'],
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
    await embedMany({
      model: new MockEmbeddingModelV4(),
      values: ['hello'],
      runtimeContext: { requestId: 'req-123' },
      telemetry: {
        includeRuntimeContext: {
          // @ts-expect-error Only keys of runtimeContext can be included.
          unknownKey: true,
        },
      },
    });
    await embedMany({
      model: new MockEmbeddingModelV4(),
      values: ['hello'],
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

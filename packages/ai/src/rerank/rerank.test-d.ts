import { describe, expectTypeOf, it } from 'vitest';
import { MockRerankingModelV4 } from '../test/mock-reranking-model-v4';
import { rerank } from './rerank';

describe('rerank types', () => {
  it('infers runtime context in lifecycle callbacks and telemetry options', () => {
    rerank({
      model: new MockRerankingModelV4(),
      documents: ['hello', 'world'],
      query: 'hello',
      runtimeContext: {
        userId: 'user-123',
        experimentId: 'experiment-123',
      },
      telemetry: {
        includeRuntimeContext: {
          experimentId: true,
        },
      },
      onStart: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<{
          userId: string;
          experimentId: string;
        }>();
      },
      onEnd: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<{
          userId: string;
          experimentId: string;
        }>();
      },
    });
  });

  it('rejects unknown runtime context keys in telemetry options', () => {
    rerank({
      model: new MockRerankingModelV4(),
      documents: ['hello'],
      query: 'hello',
      runtimeContext: {
        userId: 'user-123',
      },
      telemetry: {
        includeRuntimeContext: {
          // @ts-expect-error includeRuntimeContext only supports runtimeContext properties
          experimentId: true,
        },
      },
    });
  });
});

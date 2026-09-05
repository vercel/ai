import { describe, expectTypeOf, it } from 'vitest';
import { MockEmbeddingModelV4 } from '../test/mock-embedding-model-v4';
import { embed } from './embed';

describe('embed types', () => {
  it('infers runtime context in lifecycle callbacks and telemetry options', () => {
    embed({
      model: new MockEmbeddingModelV4(),
      value: 'hello',
      runtimeContext: {
        userId: 'user-123',
        requestId: 'request-123',
      },
      telemetry: {
        includeRuntimeContext: {
          userId: true,
        },
      },
      onStart: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<{
          userId: string;
          requestId: string;
        }>();
      },
      onEnd: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<{
          userId: string;
          requestId: string;
        }>();
      },
    });
  });

  it('rejects unknown runtime context keys in telemetry options', () => {
    embed({
      model: new MockEmbeddingModelV4(),
      value: 'hello',
      runtimeContext: {
        userId: 'user-123',
      },
      telemetry: {
        includeRuntimeContext: {
          // @ts-expect-error includeRuntimeContext only supports runtimeContext properties
          requestId: true,
        },
      },
    });
  });
});

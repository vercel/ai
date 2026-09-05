import { describe, expectTypeOf, it } from 'vitest';
import { MockEmbeddingModelV4 } from '../test/mock-embedding-model-v4';
import { embedMany } from './embed-many';

describe('embedMany types', () => {
  it('infers runtime context in lifecycle callbacks and telemetry options', () => {
    embedMany({
      model: new MockEmbeddingModelV4(),
      values: ['hello', 'world'],
      runtimeContext: {
        tenantId: 'tenant-123',
        requestId: 'request-123',
      },
      telemetry: {
        includeRuntimeContext: {
          tenantId: true,
        },
      },
      onStart: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<{
          tenantId: string;
          requestId: string;
        }>();
      },
      onEnd: event => {
        expectTypeOf(event.runtimeContext).toEqualTypeOf<{
          tenantId: string;
          requestId: string;
        }>();
      },
    });
  });
});

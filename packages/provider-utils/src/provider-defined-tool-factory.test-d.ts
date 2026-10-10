import { describe, expectTypeOf, it } from 'vitest';
import { jsonSchema } from './schema';
import { createProviderDefinedToolFactory } from './provider-defined-tool-factory';
import type { ProviderDefinedTool } from './types/tool';

describe('ProviderDefinedToolFactory', () => {
  it('infers the output type from the output schema', () => {
    const factory = createProviderDefinedToolFactory<{}, {}>({
      id: 'example.task',
      inputSchema: jsonSchema<{}>({ type: 'object' }),
    });

    const providerDefinedTool = factory({
      outputSchema: jsonSchema<number>({ type: 'number' }),
    });

    expectTypeOf(providerDefinedTool).toEqualTypeOf<
      ProviderDefinedTool<{}, number, {}>
    >();
  });
});

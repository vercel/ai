import { describe, expect, it } from 'vitest';
import { jsonSchema } from './schema';
import { createProviderDefinedToolFactory } from './provider-defined-tool-factory';

describe('createProviderDefinedToolFactory', () => {
  it('preserves the output schema outside the provider arguments', () => {
    const outputSchema = jsonSchema<number>({ type: 'number' });
    const factory = createProviderDefinedToolFactory<
      {},
      { providerOption: string }
    >({
      id: 'example.task',
      inputSchema: jsonSchema<{}>({ type: 'object' }),
    });

    const providerDefinedTool = factory({
      providerOption: 'value',
      outputSchema,
    });

    expect(providerDefinedTool.outputSchema).toBe(outputSchema);
    expect(providerDefinedTool.args).toEqual({ providerOption: 'value' });
  });
});

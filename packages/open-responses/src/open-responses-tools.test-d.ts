import { expectTypeOf, it } from 'vitest';
import { createOpenResponses } from '.';

it('exposes typed caller-executed custom tools', () => {
  const provider = createOpenResponses({
    name: 'test',
    url: 'https://example.com/v1/responses',
  });

  const customTool = provider.tools.customTool({
    description: 'Return source text',
    format: {
      type: 'grammar',
      syntax: 'regex',
      definition: '.+',
    },
    execute: async input => input.length,
  });

  expectTypeOf(customTool.execute).not.toBeUndefined();
});

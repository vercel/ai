import { InferSchema, Tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { webSearch, webSearchInputSchema } from './web-search';

describe('web-search tool type', () => {
  it('should work with inputSchema', () => {
    const webSearchTool = webSearch();

    expectTypeOf(webSearchTool).toEqualTypeOf<
      Tool<InferSchema<typeof webSearchInputSchema>, unknown>
    >();
  });
});

import { Tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { webSearch, WebSearchInput, WebSearchOutput } from './web-search';

describe('web-search tool type', () => {
  it('should work with default args', () => {
    const webSearchTool = webSearch();

    expectTypeOf(webSearchTool).toEqualTypeOf<
      Tool<WebSearchInput, WebSearchOutput>
    >();
  });
});

import type { Tool } from '@ai-sdk/provider-utils';
import { expectTypeOf, it } from 'vitest';
import { mistral } from '../mistral-provider';

it('should expose typed web search input and output', () => {
  const tool = mistral.tools.webSearch();

  expectTypeOf(tool).toExtend<
    Tool<{ query?: string }, { info?: Record<string, unknown> }, {}>
  >();
});

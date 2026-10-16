import { tool } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod/v4';
import type { StaticToolCall } from './tool-call';
import type { StaticToolResult } from './tool-result';

describe('tool set with an optional tool', () => {
  const search = tool({
    inputSchema: z.object({ query: z.string() }),
    execute: async () => 'result',
  });
  // What `{ search, ...maybeMoreTools }` gives when `maybeMoreTools` can be undefined.
  type Tools = { search: typeof search; lookup?: typeof search };

  it('StaticToolCall has no undefined member', () => {
    expectTypeOf<Extract<StaticToolCall<Tools>, undefined>>().toBeNever();
    expectTypeOf<StaticToolCall<Tools>['toolName']>().toEqualTypeOf<
      'search' | 'lookup'
    >();
  });

  it('StaticToolResult has no undefined member', () => {
    expectTypeOf<Extract<StaticToolResult<Tools>, undefined>>().toBeNever();
    expectTypeOf<StaticToolResult<Tools>['toolName']>().toEqualTypeOf<
      'search' | 'lookup'
    >();
  });
});

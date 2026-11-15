import type { InferToolInput } from '@ai-sdk/provider-utils';
import { describe, expectTypeOf, it } from 'vitest';
import { anthropic } from '../index';

describe('20260318 web tool types', () => {
  it('types web search response inclusion', () => {
    const tool = anthropic.tools.webSearch_20260318({
      responseInclusion: 'excluded',
    });

    expectTypeOf<
      NonNullable<Parameters<typeof anthropic.tools.webSearch_20260318>[0]>
    >().toExtend<{
      responseInclusion?: 'full' | 'excluded';
    }>();
    expectTypeOf<InferToolInput<typeof tool>>().toEqualTypeOf<{
      query: string;
    }>();
  });

  it('types web fetch cache and response inclusion options', () => {
    const tool = anthropic.tools.webFetch_20260318({
      useCache: false,
      responseInclusion: 'excluded',
    });

    expectTypeOf<
      NonNullable<Parameters<typeof anthropic.tools.webFetch_20260318>[0]>
    >().toExtend<{
      useCache?: boolean;
      responseInclusion?: 'full' | 'excluded';
    }>();
    expectTypeOf<InferToolInput<typeof tool>>().toEqualTypeOf<{
      url: string;
    }>();
  });

  it('does not expose response inclusion on older web tool versions', () => {
    // @ts-expect-error responseInclusion requires web_search_20260318
    anthropic.tools.webSearch_20260209({ responseInclusion: 'excluded' });
    // @ts-expect-error responseInclusion requires web_fetch_20260318
    anthropic.tools.webFetch_20260209({ responseInclusion: 'excluded' });
  });
});

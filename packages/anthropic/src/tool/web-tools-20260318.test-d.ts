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

  it('types allowed callers on dynamic filtering web tool versions', () => {
    anthropic.tools.webSearch_20260209({ allowedCallers: ['direct'] });
    anthropic.tools.webSearch_20260318({ allowedCallers: ['direct'] });
    anthropic.tools.webFetch_20260209({ allowedCallers: ['direct'] });
    anthropic.tools.webFetch_20260318({
      allowedCallers: ['direct', 'code_execution_20260120'],
    });
    anthropic.tools.webFetch_20260318({
      // @ts-expect-error web tools reject the code_execution_20250825 caller
      allowedCallers: ['code_execution_20250825'],
    });
  });

  it('does not expose response inclusion on older web tool versions', () => {
    // @ts-expect-error responseInclusion requires web_search_20260318
    anthropic.tools.webSearch_20260209({ responseInclusion: 'excluded' });
    // @ts-expect-error responseInclusion requires web_fetch_20260318
    anthropic.tools.webFetch_20260209({ responseInclusion: 'excluded' });
  });
});

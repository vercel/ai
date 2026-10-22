import { expectTypeOf } from 'vitest';
import type {
  ParallelSearchConfig,
  ParallelSearchResponse,
  ParallelSearchResult,
} from './parallel-search';

expectTypeOf<ParallelSearchResult>().not.toHaveProperty('relevanceScore');
expectTypeOf<ParallelSearchResult>().not.toHaveProperty('excerpt');
expectTypeOf<ParallelSearchResult['excerpts']>().toEqualTypeOf<string[]>();
expectTypeOf<ParallelSearchResponse>().toHaveProperty('session_id');
expectTypeOf<'basic'>().toExtend<NonNullable<ParallelSearchConfig['mode']>>();
expectTypeOf<'one-shot'>().toExtend<
  NonNullable<ParallelSearchConfig['mode']>
>();

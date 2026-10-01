import { expectTypeOf } from 'vitest';
import type { TakoCard, TakoWebResult } from './tako-search';

expectTypeOf<TakoCard>().not.toHaveProperty('relevance_score');
expectTypeOf<TakoWebResult>().not.toHaveProperty('citation_number');

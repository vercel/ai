import { expectTypeOf } from 'vitest';
import type { Experimental_EvaluationModelV4 as EvaluationModelV4 } from '@ai-sdk/provider';
import {
  openai,
  type Experimental_OpenAIEvaluationModelId as OpenAIEvaluationModelId,
} from './index';

expectTypeOf<
  Extract<OpenAIEvaluationModelId, 'text-embedding-3-large'>
>().toEqualTypeOf<'text-embedding-3-large'>();
expectTypeOf(
  openai.evaluationModel('text-embedding-3-large'),
).toEqualTypeOf<EvaluationModelV4>();
expectTypeOf<
  Extract<OpenAIEvaluationModelId, 'gpt-5.6-luna'>
>().toEqualTypeOf<'gpt-5.6-luna'>();

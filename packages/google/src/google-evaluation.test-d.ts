import { expectTypeOf } from 'vitest';
import type { Experimental_EvaluationModelV4 as EvaluationModelV4 } from '@ai-sdk/provider';
import {
  google,
  type Experimental_GoogleEvaluationModelId as GoogleEvaluationModelId,
} from './index';

expectTypeOf<
  Extract<GoogleEvaluationModelId, 'gemini-embedding-2'>
>().toEqualTypeOf<'gemini-embedding-2'>();
expectTypeOf(
  google.evaluationModel('gemini-embedding-2'),
).toEqualTypeOf<EvaluationModelV4>();
expectTypeOf<
  Extract<GoogleEvaluationModelId, 'gemini-3.5-flash-lite'>
>().toEqualTypeOf<'gemini-3.5-flash-lite'>();

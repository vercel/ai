import { expectTypeOf } from 'vitest';
import type { Experimental_EvaluationModelV4 as EvaluationModelV4 } from '@ai-sdk/provider';
import {
  cohere,
  type Experimental_CohereEvaluationModelId as CohereEvaluationModelId,
} from './index';

expectTypeOf<
  Extract<CohereEvaluationModelId, 'embed-v4.0'>
>().toEqualTypeOf<'embed-v4.0'>();
expectTypeOf(
  cohere.evaluationModel('embed-v4.0'),
).toEqualTypeOf<EvaluationModelV4>();

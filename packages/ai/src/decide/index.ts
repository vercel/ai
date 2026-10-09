import type { Context } from '@ai-sdk/provider-utils';
import { decide } from './decide';
import type { Experimental_DecisionModelV4Question as DecisionQuestion } from '@ai-sdk/provider';
import type {
  DecideStartEvent,
  DecideEndEvent,
  DecisionModelCallStartEvent,
  DecisionModelCallEndEvent,
} from './decide-events';
import type {
  DecisionModel,
  DecisionAnswer,
  DecisionResult,
} from './decision-result';

export { decide as experimental_decide } from './decide';
export type {
  DecideStartEvent as Experimental_DecideStartEvent,
  DecideEndEvent as Experimental_DecideEndEvent,
  DecisionModelCallStartEvent as Experimental_DecisionModelCallStartEvent,
  DecisionModelCallEndEvent as Experimental_DecisionModelCallEndEvent,
} from './decide-events';
export type {
  DecisionModel as Experimental_DecisionModel,
  DecisionAnswer as Experimental_DecisionAnswer,
  DecisionResult as Experimental_DecisionResult,
} from './decision-result';

/** @deprecated Use `experimental_decide` instead. */
export const experimental_evaluate: typeof decide = decide;

/** @deprecated Use `Experimental_DecideStartEvent` instead. */
export type Experimental_EvaluateStartEvent<
  RUNTIME_CONTEXT extends Context = Context,
> = DecideStartEvent<RUNTIME_CONTEXT>;

/** @deprecated Use `Experimental_DecideEndEvent` instead. */
export type Experimental_EvaluateEndEvent<
  RUNTIME_CONTEXT extends Context = Context,
> = DecideEndEvent<RUNTIME_CONTEXT>;

/** @deprecated Use `Experimental_DecisionModelCallStartEvent` instead. */
export type Experimental_EvaluationModelCallStartEvent =
  DecisionModelCallStartEvent;

/** @deprecated Use `Experimental_DecisionModelCallEndEvent` instead. */
export type Experimental_EvaluationModelCallEndEvent =
  DecisionModelCallEndEvent;

/** @deprecated Use `Experimental_DecisionModel` instead. */
export type Experimental_EvaluationModel = DecisionModel;

/** @deprecated Use `Experimental_DecisionQuestion` instead. */
export type Experimental_EvaluationQuestion = DecisionQuestion;

/** @deprecated Use `Experimental_DecisionAnswer` instead. */
export type Experimental_EvaluationAnswer<QUESTION extends DecisionQuestion> =
  DecisionAnswer<QUESTION>;

/** @deprecated Use `Experimental_DecisionResult` instead. */
export type Experimental_EvaluationResult<
  QUESTIONS extends Record<string, DecisionQuestion>,
> = DecisionResult<QUESTIONS>;

export type {
  DecisionState as Experimental_DecisionState,
  DecisionStatePart as Experimental_DecisionStatePart,
} from './decision-state';

export type { Experimental_DecisionModelV4Question as Experimental_DecisionQuestion } from '@ai-sdk/provider';

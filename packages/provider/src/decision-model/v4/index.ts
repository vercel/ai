import type { DecisionModelV4CallOptions } from './decision-model-v4-call-options';
import type {
  DecisionModelV4Input,
  DecisionModelV4Question,
} from './decision-model-v4-question';
import type {
  DecisionModelV4Answer,
  DecisionModelV4Result,
} from './decision-model-v4-result';
import type { DecisionModelV4 } from './decision-model-v4';

export type { DecisionModelV4 as Experimental_DecisionModelV4 } from './decision-model-v4';
export type { DecisionModelV4CallOptions as Experimental_DecisionModelV4CallOptions } from './decision-model-v4-call-options';
export type {
  DecisionModelV4Input as Experimental_DecisionModelV4Input,
  DecisionModelV4Question as Experimental_DecisionModelV4Question,
} from './decision-model-v4-question';
export type {
  DecisionModelV4Answer as Experimental_DecisionModelV4Answer,
  DecisionModelV4Result as Experimental_DecisionModelV4Result,
} from './decision-model-v4-result';

/** @deprecated Implement `Experimental_DecisionModelV4` with `doDecide` instead. */
export type Experimental_EvaluationModelV4 = Omit<
  DecisionModelV4,
  'doDecide'
> & {
  doEvaluate: DecisionModelV4['doDecide'];
};

/** @deprecated Use `Experimental_DecisionModelV4CallOptions` instead. */
export type Experimental_EvaluationModelV4CallOptions =
  DecisionModelV4CallOptions;

/** @deprecated Use `Experimental_DecisionModelV4Question` instead. */
export type Experimental_EvaluationModelV4Question = DecisionModelV4Question;

/** @deprecated Use `Experimental_DecisionModelV4Answer` instead. */
export type Experimental_EvaluationModelV4Answer = DecisionModelV4Answer;

/** @deprecated Use `Experimental_DecisionModelV4Result` instead. */
export type Experimental_EvaluationModelV4Result = DecisionModelV4Result;

export type {
  DecisionModelV4State as Experimental_DecisionModelV4State,
  DecisionModelV4StatePart as Experimental_DecisionModelV4StatePart,
} from './decision-model-v4-state';

/** @deprecated Use `Experimental_DecisionModelV4Input` instead. */
export type Experimental_EvaluationModelV4Input = DecisionModelV4Input;

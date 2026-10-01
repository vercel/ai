import type { JSONObject, JSONValue } from '../../json-value';

/** Shared state or structured instructions for an evaluation. */
export type EvaluationModelV4Input =
  | string
  | Readonly<JSONObject>
  | readonly JSONValue[];

/** A judgment to make about the shared state. */
export type EvaluationModelV4Question =
  | {
      readonly type: 'choice';
      readonly instructions: EvaluationModelV4Input;
      /** Nonempty map of option names to descriptions. Null means no description. */
      readonly criteria: Readonly<
        Record<string, EvaluationModelV4Input | null>
      >;
    }
  | {
      readonly type: 'score';
      readonly instructions: EvaluationModelV4Input;
      /** At least two ordered levels, indexed from zero. */
      readonly criteria: readonly (EvaluationModelV4Input | null)[];
    }
  | {
      readonly type: 'boolean';
      readonly instructions: EvaluationModelV4Input;
      readonly criteria?: {
        readonly true?: EvaluationModelV4Input | null;
        readonly false?: EvaluationModelV4Input | null;
      };
    };

import type { JSONObject, JSONValue } from '../../json-value';

/** Shared state or structured instructions for a decision. */
export type DecisionModelV4Input =
  | string
  | Readonly<JSONObject>
  | readonly JSONValue[];

/** A judgment to make about the shared state. */
export type DecisionModelV4Question =
  | {
      readonly type: 'choice';
      readonly instructions: DecisionModelV4Input;
      /** Nonempty map of option names to descriptions. Null means no description. */
      readonly criteria: Readonly<Record<string, DecisionModelV4Input | null>>;
    }
  | {
      readonly type: 'score';
      readonly instructions: DecisionModelV4Input;
      /** At least two ordered levels, indexed from zero. */
      readonly criteria: readonly (DecisionModelV4Input | null)[];
    }
  | {
      readonly type: 'boolean';
      readonly instructions: DecisionModelV4Input;
      readonly criteria?: {
        readonly true?: DecisionModelV4Input | null;
        readonly false?: DecisionModelV4Input | null;
      };
    };

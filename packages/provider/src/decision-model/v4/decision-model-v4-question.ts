import type { JSONObject, JSONValue } from '../../json-value';

/** Content for decision instructions and criteria descriptions. */
export type DecisionModelV4Input =
  | string
  | Readonly<JSONObject>
  | readonly JSONValue[];

/** A judgment to make about the shared state. */
export type DecisionModelV4Question =
  | {
      readonly type: 'choice';
      /** May be omitted or null when supported by the provider and criteria define the judgment. */
      readonly instructions?: DecisionModelV4Input | null;
      /** Nonempty map of option names to descriptions. Null means no description. */
      readonly criteria: Readonly<Record<string, DecisionModelV4Input | null>>;
    }
  | {
      readonly type: 'score';
      /** May be omitted or null when supported by the provider and criteria define the judgment. */
      readonly instructions?: DecisionModelV4Input | null;
      /** At least one ordered level, indexed from zero. Providers may require more. */
      readonly criteria: readonly (DecisionModelV4Input | null)[];
    }
  | {
      readonly type: 'box';
      readonly instructions: DecisionModelV4Input;
    }
  | {
      readonly type: 'boolean';
      /** May be omitted or null when supported by the provider and criteria define the judgment. */
      readonly instructions?: DecisionModelV4Input | null;
      /** At least one non-null description is required when instructions are absent. */
      readonly criteria?: {
        readonly true?: DecisionModelV4Input | null;
        readonly false?: DecisionModelV4Input | null;
      };
    };

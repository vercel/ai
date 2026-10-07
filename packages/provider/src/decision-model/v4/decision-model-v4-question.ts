/** A judgment to make about the shared state. */
export type DecisionModelV4Question =
  | {
      readonly type: 'choice';
      readonly instructions: string;
      /** Nonempty map of option names to descriptions. Null means no description. */
      readonly criteria: Readonly<Record<string, string | null>>;
    }
  | {
      readonly type: 'score';
      readonly instructions: string;
      /** At least two ordered levels, indexed from zero. */
      readonly criteria: readonly (string | null)[];
    }
  | {
      readonly type: 'boolean';
      readonly instructions: string;
      readonly criteria?: {
        readonly true?: string;
        readonly false?: string;
      };
    };

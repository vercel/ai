import type {
  Experimental_DecisionModelV4Question as DecisionModelV4Question,
  JSONObject,
  JSONValue,
} from '@ai-sdk/provider';

/** Public input for decision instructions and criteria descriptions. */
export type DecisionQuestionInput =
  | string
  | Readonly<JSONObject>
  | readonly JSONValue[];

/** A judgment to make about the shared state. */
export type DecisionQuestion =
  | {
      readonly type: 'choice';
      readonly instructions: DecisionQuestionInput;
      /** Nonempty map of option names to descriptions. Null means no description. */
      readonly criteria: Readonly<Record<string, DecisionQuestionInput | null>>;
    }
  | {
      readonly type: 'score';
      readonly instructions: DecisionQuestionInput;
      /** At least two ordered levels, indexed from zero. */
      readonly criteria: readonly (DecisionQuestionInput | null)[];
    }
  | {
      readonly type: 'boolean';
      readonly instructions: DecisionQuestionInput;
      readonly criteria?: {
        readonly true?: DecisionQuestionInput | null;
        readonly false?: DecisionQuestionInput | null;
      };
    };

function toText(input: DecisionQuestionInput): string {
  return typeof input === 'string' ? input : JSON.stringify(input);
}

function prepareDescription(
  input: DecisionQuestionInput | null,
): string | null {
  return input === null ? null : toText(input);
}

export function prepareDecisionQuestions(
  questions: Readonly<Record<string, DecisionQuestion>>,
): Readonly<Record<string, DecisionModelV4Question>> {
  return Object.fromEntries(
    Object.entries(questions).map(
      ([id, question]): [string, DecisionModelV4Question] => {
        const instructions = toText(question.instructions);
        switch (question.type) {
          case 'choice':
            return [
              id,
              {
                type: question.type,
                instructions,
                criteria: Object.fromEntries(
                  Object.entries(question.criteria).map(
                    ([option, description]) => [
                      option,
                      prepareDescription(description),
                    ],
                  ),
                ),
              },
            ];
          case 'score':
            return [
              id,
              {
                type: question.type,
                instructions,
                criteria: question.criteria.map(prepareDescription),
              },
            ];
          case 'boolean':
            return [
              id,
              {
                type: question.type,
                instructions,
                ...(question.criteria === undefined
                  ? {}
                  : {
                      criteria: Object.fromEntries(
                        Object.entries(question.criteria).flatMap(
                          ([outcome, description]) =>
                            description === null
                              ? []
                              : [[outcome, toText(description)]],
                        ),
                      ),
                    }),
              },
            ];
        }
      },
    ),
  );
}

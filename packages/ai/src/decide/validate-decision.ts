import {
  InvalidResponseDataError,
  type Experimental_DecisionModelV4Result as DecisionModelV4Result,
  type Experimental_DecisionModelV4Question as DecisionQuestion,
} from '@ai-sdk/provider';
import type { DecisionState } from './decision-state';
import { InvalidArgumentError } from '../error/invalid-argument-error';

// Absolute tolerance for sums and means. Never renormalize provider output.
const tolerance = 1e-6;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Checks the JSON constraints that types cannot express: finite numbers, no
 * cycles, and no array holes. These would otherwise be silently changed by
 * `JSON.stringify` or make it throw.
 */
function isSerializableJSON(
  value: unknown,
  ancestors = new Set<object>(),
): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value == null || typeof value !== 'object') return true;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid = Array.isArray(value)
    ? Array.from(value.keys()).every(
        index => index in value && isSerializableJSON(value[index], ancestors),
      )
    : Object.values(value).every(item => isSerializableJSON(item, ancestors));
  ancestors.delete(value);
  return valid;
}

function invalidInput(
  parameter: string,
  value: unknown,
  message: string,
): never {
  throw new InvalidArgumentError({ parameter, value, message });
}

export function validateDecisionInput({
  state,
  questions,
}: {
  state: DecisionState;
  questions: Readonly<Record<string, DecisionQuestion>>;
}) {
  if (
    Array.isArray(state) &&
    Array.from(state.keys()).some(index => !(index in state))
  ) {
    invalidInput('state', state, 'state parts must not contain array holes');
  }

  const stateJSON = Array.isArray(state)
    ? state.flatMap(part => (part.type === 'json' ? [part.value] : []))
    : state;
  if (!isSerializableJSON(stateJSON)) {
    invalidInput(
      'state',
      state,
      'JSON content must not contain non-finite numbers, cycles, or array holes',
    );
  }

  if (Object.keys(questions).length === 0) {
    invalidInput('questions', questions, 'must be a nonempty question map');
  }

  for (const [id, question] of Object.entries(questions)) {
    const parameter = `questions.${id}`;
    if (
      !isSerializableJSON(question.instructions) ||
      ('criteria' in question && !isSerializableJSON(question.criteria))
    ) {
      invalidInput(
        parameter,
        question,
        'instructions and criteria must not contain non-finite numbers, cycles, or array holes',
      );
    }
    switch (question.type) {
      case 'choice':
        if (Object.keys(question.criteria).length === 0) {
          invalidInput(
            parameter,
            question,
            'choice criteria must be a nonempty option map',
          );
        }
        break;
      case 'score':
        if (question.criteria.length === 0) {
          invalidInput(
            parameter,
            question,
            'score criteria must contain at least one ordered level',
          );
        }
        break;
      case 'boolean': {
        const criteria = question.criteria;
        if (
          question.instructions == null &&
          (criteria == null ||
            !Object.values(criteria).some(value => value != null))
        ) {
          invalidInput(
            parameter,
            question,
            'boolean questions require instructions or at least one non-null criterion',
          );
        }
        if (
          criteria != null &&
          Object.keys(criteria).some(key => key !== 'true' && key !== 'false')
        ) {
          invalidInput(
            parameter,
            question,
            'boolean criteria may only describe true and false',
          );
        }
        break;
      }
    }
  }
}

function invalidAnswer(answers: unknown, message: string): never {
  throw new InvalidResponseDataError({ data: answers, message });
}

function isProbability(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every(key => Object.hasOwn(value, key))
  );
}

function validateDistribution(
  value: unknown,
  keys: string[],
  answers: unknown,
  id: string,
  roundingError: number,
): asserts value is Record<string, number> {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, keys) ||
    !Object.values(value).every(isProbability)
  ) {
    invalidAnswer(
      answers,
      `Question "${id}" must have a complete distribution of finite probabilities in [0, 1].`,
    );
  }
  const sum = Object.values(value).reduce<number>(
    (total, probability) => total + (probability as number),
    0,
  );
  if (Math.abs(sum - 1) > tolerance + keys.length * roundingError) {
    invalidAnswer(
      answers,
      `Question "${id}" probabilities must sum to 1 within the declared rounding precision.`,
    );
  }
}

export function validateDecisionAnswers({
  questions,
  answers,
  rounding,
}: {
  questions: Readonly<Record<string, DecisionQuestion>>;
  answers: unknown;
  rounding?: DecisionModelV4Result['rounding'];
}) {
  function roundingError(decimals: number | undefined): number {
    if (decimals === undefined) return 0;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 15) {
      invalidAnswer(
        answers,
        'Decision rounding decimals must be integers between 0 and 15.',
      );
    }
    return 0.5 * 10 ** -decimals;
  }
  const probabilityError = roundingError(rounding?.probabilityDecimals);
  const scoreError = roundingError(rounding?.scoreDecimals);
  if (!isRecord(answers) || !hasExactKeys(answers, Object.keys(questions))) {
    invalidAnswer(
      answers,
      'Decision must return exactly one answer for every question.',
    );
  }

  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
    if (isRecord(answer) && answer.type === 'refusal') continue;
    if (!isRecord(answer) || answer.type !== question.type) {
      invalidAnswer(
        answers,
        `Question "${id}" returned an answer with the wrong type.`,
      );
    }

    switch (question.type) {
      case 'choice': {
        if (
          typeof answer.choice !== 'string' ||
          !Object.hasOwn(question.criteria, answer.choice)
        ) {
          invalidAnswer(
            answers,
            `Question "${id}" selected an unknown option.`,
          );
        }
        if (answer.probabilities !== undefined) {
          validateDistribution(
            answer.probabilities,
            Object.keys(question.criteria),
            answers,
            id,
            probabilityError,
          );
          const selected = answer.probabilities[answer.choice];
          if (
            Object.values(answer.probabilities).some(
              probability =>
                probability > selected + tolerance + 2 * probabilityError,
            )
          ) {
            invalidAnswer(
              answers,
              `Question "${id}" did not select a highest-probability option.`,
            );
          }
        }
        break;
      }
      case 'score': {
        if (
          typeof answer.score !== 'number' ||
          !Number.isFinite(answer.score) ||
          answer.score < 0 ||
          answer.score > question.criteria.length - 1
        ) {
          invalidAnswer(
            answers,
            `Question "${id}" score must be in [0, ${question.criteria.length - 1}].`,
          );
        }
        if (answer.probabilities !== undefined) {
          const keys = question.criteria.map((_, index) => String(index));
          validateDistribution(
            answer.probabilities,
            keys,
            answers,
            id,
            probabilityError,
          );
          const mean = Object.entries(answer.probabilities).reduce(
            (total, [index, probability]) =>
              total + Number(index) * probability,
            0,
          );
          const meanRoundingError = keys.reduce(
            (total, index) => total + Number(index) * probabilityError,
            0,
          );
          if (
            Math.abs(mean - answer.score) >
            tolerance + meanRoundingError + scoreError
          ) {
            invalidAnswer(
              answers,
              `Question "${id}" score must equal the probability-weighted mean within the declared rounding precision.`,
            );
          }
        }
        break;
      }
      case 'box': {
        const box = answer.box;
        if (
          !isRecord(box) ||
          !hasExactKeys(box, ['top', 'bottom', 'left', 'right']) ||
          !isProbability(box.left) ||
          !isProbability(box.right) ||
          !isProbability(box.top) ||
          !isProbability(box.bottom) ||
          !(box.left < box.right) ||
          !(box.top < box.bottom)
        ) {
          invalidAnswer(
            answers,
            `Question "${id}" must return box edges in [0, 1] with left < right and top < bottom.`,
          );
        }
        break;
      }
      case 'boolean':
        if (!isProbability(answer.probability)) {
          invalidAnswer(
            answers,
            `Question "${id}" must return P(true) as a finite probability in [0, 1].`,
          );
        }
        break;
    }
  }
}

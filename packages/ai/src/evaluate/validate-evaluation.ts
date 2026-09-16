import {
  InvalidResponseDataError,
  type Experimental_EvaluationModelV4CallOptions as EvaluationModelV4CallOptions,
  type Experimental_EvaluationModelV4Result as EvaluationModelV4Result,
} from '@ai-sdk/provider';
import { InvalidArgumentError } from '../error/invalid-argument-error';

// Absolute tolerance for sums and means. Never renormalize provider output.
const tolerance = 1e-6;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value == null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJSON(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean')
    return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || (!Array.isArray(value) && !isRecord(value)))
    return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const valid =
    Object.getOwnPropertySymbols(value).length === 0 &&
    (Array.isArray(value)
      ? Array.from(value).every(item => isJSON(item, ancestors))
      : Object.values(value).every(item => isJSON(item, ancestors)));
  ancestors.delete(value);
  return valid;
}

function isInput(value: unknown): boolean {
  return (
    (typeof value === 'string' || Array.isArray(value) || isRecord(value)) &&
    isJSON(value)
  );
}

function invalidInput(
  parameter: string,
  value: unknown,
  message: string,
): never {
  throw new InvalidArgumentError({ parameter, value, message });
}

export function validateEvaluationInput({
  state,
  questions,
}: EvaluationModelV4CallOptions) {
  if (!isInput(state)) {
    invalidInput(
      'state',
      state,
      'must be a JSON-compatible string, object, or array',
    );
  }
  if (!isRecord(questions) || Object.keys(questions).length === 0) {
    invalidInput('questions', questions, 'must be a nonempty question map');
  }

  for (const [id, question] of Object.entries(questions)) {
    const parameter = `questions.${id}`;
    if (!isRecord(question) || !isInput(question.instructions)) {
      invalidInput(
        parameter,
        question,
        'instructions must be a JSON-compatible string, object, or array',
      );
    }
    const criteria = question.criteria;
    switch (question.type) {
      case 'choice':
        if (!isRecord(criteria) || Object.keys(criteria).length === 0) {
          invalidInput(
            parameter,
            question,
            'choice criteria must be a nonempty option map',
          );
        }
        break;
      case 'score':
        if (!Array.isArray(criteria) || criteria.length < 2) {
          invalidInput(
            parameter,
            question,
            'score criteria must contain at least two ordered levels',
          );
        }
        break;
      case 'boolean':
        if (criteria === undefined) continue;
        if (
          !isRecord(criteria) ||
          Object.keys(criteria).some(key => key !== 'true' && key !== 'false')
        ) {
          invalidInput(
            parameter,
            question,
            'boolean criteria may only describe true and false',
          );
        }
        break;
      default:
        invalidInput(
          parameter,
          question,
          'question type must be choice, score, or boolean',
        );
    }
    if (
      !isJSON(criteria) ||
      Object.values(criteria).some(value => value !== null && !isInput(value))
    ) {
      invalidInput(
        parameter,
        question,
        'criteria descriptions must be JSON-compatible strings, objects, arrays, or null',
      );
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

export function validateEvaluationAnswers({
  questions,
  answers,
  rounding,
}: {
  questions: EvaluationModelV4CallOptions['questions'];
  answers: unknown;
  rounding?: EvaluationModelV4Result['rounding'];
}) {
  function roundingError(decimals: number | undefined): number {
    if (decimals === undefined) return 0;
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 15) {
      invalidAnswer(
        answers,
        'Evaluation rounding decimals must be integers between 0 and 15.',
      );
    }
    return 0.5 * 10 ** -decimals;
  }
  const probabilityError = roundingError(rounding?.probabilityDecimals);
  const scoreError = roundingError(rounding?.scoreDecimals);
  if (!isRecord(answers) || !hasExactKeys(answers, Object.keys(questions))) {
    invalidAnswer(
      answers,
      'Evaluation must return exactly one answer for every question.',
    );
  }

  for (const [id, question] of Object.entries(questions)) {
    const answer = answers[id];
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
              probability => probability > selected + tolerance,
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

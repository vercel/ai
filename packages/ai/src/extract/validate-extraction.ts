import {
  InvalidResponseDataError,
  type Experimental_DecisionModelV4State as DecisionModelV4State,
  type Experimental_ExtractionModelV4Field as ExtractionField,
} from '@ai-sdk/provider';
import type { DecisionState } from '../decide/decision-state';
import {
  hasExactKeys,
  invalidInput,
  isProbability,
  isRecord,
  isSerializableJSON,
  validateDecisionState,
} from '../decide/validate-decision';

type ValueField = Exclude<ExtractionField, { type: 'list' }>;

const durationUnits = [
  'seconds',
  'minutes',
  'hours',
  'days',
  'weeks',
  'months',
  'years',
];

const listItems = ['text', 'number', 'date'];

const time = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

const datetime =
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d(\.\d{1,9})?)?(Z|[+-]([01]\d|2[0-3]):[0-5]\d)?$/;

function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

function isNumber(
  value: unknown,
  { integer, decimals }: { integer?: boolean; decimals?: number },
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    (!integer || Number.isInteger(value)) &&
    (decimals === undefined || Number(value.toFixed(decimals)) === value)
  );
}

function isDenseArray(value: unknown): value is unknown[] {
  return Array.isArray(value) && Object.keys(value).length === value.length;
}

function isValue(field: ValueField, value: unknown): boolean {
  switch (field.type) {
    case 'text':
      return typeof value === 'string';
    case 'number':
      return isNumber(value, field);
    case 'duration':
      return isNumber(value, field) && value >= 0;
    case 'date':
      return isDate(value);
    case 'time':
      return typeof value === 'string' && time.test(value);
    case 'datetime':
      return (
        typeof value === 'string' &&
        datetime.test(value) &&
        isDate(value.slice(0, 10))
      );
  }
}

function isSource(source: unknown, state: DecisionModelV4State): boolean {
  if (
    !isRecord(source) ||
    typeof source.part !== 'number' ||
    !Number.isInteger(source.part) ||
    source.part < 0 ||
    source.part >= state.length
  ) {
    return false;
  }
  const part = state[source.part];
  switch (source.type) {
    case 'text':
      return (
        part.type === 'text' &&
        typeof source.start === 'number' &&
        typeof source.end === 'number' &&
        Number.isInteger(source.start) &&
        Number.isInteger(source.end) &&
        source.start >= 0 &&
        source.start < source.end &&
        source.end <= part.text.length
      );
    case 'file':
      return part.type === 'file';
    default:
      return false;
  }
}

export function validateExtractionInput({
  state,
  fields,
  referenceDate,
}: {
  state: DecisionState;
  fields: Readonly<Record<string, ExtractionField>>;
  referenceDate?: string;
}) {
  validateDecisionState(state);

  if (referenceDate !== undefined && !isDate(referenceDate)) {
    invalidInput(
      'referenceDate',
      referenceDate,
      'must be a YYYY-MM-DD calendar date',
    );
  }

  if (Object.keys(fields).length === 0) {
    invalidInput('fields', fields, 'must be a nonempty field map');
  }

  for (const [id, field] of Object.entries(fields)) {
    const parameter = `fields.${id}`;
    if (!isSerializableJSON(field.instructions)) {
      invalidInput(
        parameter,
        field,
        'instructions must not contain non-finite numbers, cycles, or array holes',
      );
    }
    if (
      'decimals' in field &&
      field.decimals !== undefined &&
      !(
        Number.isInteger(field.decimals) &&
        field.decimals >= 0 &&
        field.decimals <= 6
      )
    ) {
      invalidInput(parameter, field, 'decimals must be an integer from 0 to 6');
    }
    if (
      field.type === 'duration' &&
      field.unit !== undefined &&
      !durationUnits.includes(field.unit)
    ) {
      invalidInput(
        parameter,
        field,
        `duration unit must be one of ${durationUnits.join(', ')}`,
      );
    }
    if (field.type === 'list' && !listItems.includes(field.items)) {
      invalidInput(
        parameter,
        field,
        `list items must be one of ${listItems.join(', ')}`,
      );
    }
  }
}

function invalidAnswer(answers: unknown, message: string): never {
  throw new InvalidResponseDataError({ data: answers, message });
}

export function validateExtractionAnswers({
  fields,
  state,
  answers,
}: {
  fields: Readonly<Record<string, ExtractionField>>;
  state: DecisionModelV4State;
  answers: unknown;
}) {
  if (!isRecord(answers) || !hasExactKeys(answers, Object.keys(fields))) {
    invalidAnswer(
      answers,
      'Extraction must return exactly one answer for every field.',
    );
  }

  for (const [id, field] of Object.entries(fields)) {
    const answer = answers[id];
    if (isRecord(answer) && answer.type === 'refusal') continue;
    if (!isRecord(answer) || answer.type !== field.type) {
      invalidAnswer(
        answers,
        `Field "${id}" returned an answer with the wrong type.`,
      );
    }
    if (
      (answer.pNull !== undefined && !isProbability(answer.pNull)) ||
      (answer.confidence !== undefined && !isProbability(answer.confidence))
    ) {
      invalidAnswer(
        answers,
        `Field "${id}" must return pNull and confidence as finite probabilities in [0, 1].`,
      );
    }

    if (field.type === 'list') {
      const item: ValueField =
        field.items === 'number'
          ? {
              type: 'number',
              integer: field.integer,
              decimals: field.decimals,
            }
          : { type: field.items };
      const value = answer.value;
      if (
        value !== null &&
        !(isDenseArray(value) && value.every(entry => isValue(item, entry)))
      ) {
        invalidAnswer(
          answers,
          `Field "${id}" must return null or a list of ${field.items} values.`,
        );
      }
      const items = answer.items;
      if (
        items !== undefined &&
        !(
          isDenseArray(items) &&
          Array.isArray(value) &&
          items.length === value.length &&
          items.every(
            entry =>
              isRecord(entry) &&
              (entry.confidence === undefined ||
                isProbability(entry.confidence)) &&
              (entry.source === undefined || isSource(entry.source, state)),
          )
        )
      ) {
        invalidAnswer(
          answers,
          `Field "${id}" must return one item entry per list value, with confidences in [0, 1] and sources inside the state.`,
        );
      }
      continue;
    }

    if (answer.value !== null && !isValue(field, answer.value)) {
      invalidAnswer(
        answers,
        `Field "${id}" must return null or a valid ${field.type} value.`,
      );
    }
    if (answer.guess !== undefined && !isValue(field, answer.guess)) {
      invalidAnswer(
        answers,
        `Field "${id}" must return a valid ${field.type} guess.`,
      );
    }
    if (answer.source !== undefined && !isSource(answer.source, state)) {
      invalidAnswer(
        answers,
        `Field "${id}" returned a source outside the state.`,
      );
    }
  }
}

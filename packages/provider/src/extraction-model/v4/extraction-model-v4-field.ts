import type { DecisionModelV4Input } from '../../decision-model/v4/decision-model-v4-question';

/** Content for extraction field instructions. */
export type ExtractionModelV4Input = DecisionModelV4Input;

export type ExtractionModelV4DurationUnit =
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'months'
  | 'years';

/** A typed value to extract from the shared state. */
export type ExtractionModelV4Field =
  | {
      /** Free text, returned as a string. */
      readonly type: 'text';
      readonly instructions?: ExtractionModelV4Input | null;
    }
  | {
      /** A number, returned as a finite number. */
      readonly type: 'number';
      readonly instructions?: ExtractionModelV4Input | null;
      /** Unit the value should be expressed in, e.g. `'USD'` or `'kg'`. */
      readonly unit?: string;
      /** Require an integer value. */
      readonly integer?: boolean;
      /** Maximum decimal places, an integer from 0 to 6. */
      readonly decimals?: number;
    }
  | {
      /** A calendar date, returned as `YYYY-MM-DD`. */
      readonly type: 'date';
      readonly instructions?: ExtractionModelV4Input | null;
    }
  | {
      /** A time of day, returned as `HH:MM` or `HH:MM:SS`. */
      readonly type: 'time';
      readonly instructions?: ExtractionModelV4Input | null;
    }
  | {
      /** An ISO 8601 date and time, with an offset when the source has one. */
      readonly type: 'datetime';
      readonly instructions?: ExtractionModelV4Input | null;
    }
  | {
      /** A nonnegative length of time, returned as a number in `unit`. */
      readonly type: 'duration';
      readonly instructions?: ExtractionModelV4Input | null;
      /** Defaults to `'seconds'`. */
      readonly unit?: ExtractionModelV4DurationUnit;
      readonly integer?: boolean;
      /** Maximum decimal places, an integer from 0 to 6. */
      readonly decimals?: number;
    }
  | {
      /** Zero or more values of the same item type. */
      readonly type: 'list';
      readonly instructions?: ExtractionModelV4Input | null;
      readonly items: 'text' | 'number' | 'date';
      /** Require integer items. Only applies to number items. */
      readonly integer?: boolean;
      /** Maximum decimal places for number items, an integer from 0 to 6. */
      readonly decimals?: number;
    };

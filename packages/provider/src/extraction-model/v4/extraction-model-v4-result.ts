import type {
  SharedV4Headers,
  SharedV4ProviderMetadata,
  SharedV4Warning,
} from '../../shared/v4';

/** Where in the state a value was found. */
export type ExtractionModelV4Source =
  | {
      type: 'text';
      /** Index of a text part in the state. */
      part: number;
      /** Start offset in UTF-16 code units, inclusive. */
      start: number;
      /** End offset in UTF-16 code units, exclusive. */
      end: number;
    }
  | {
      type: 'file';
      /** Index of the file part the value was read from. */
      part: number;
    };

type ValueAnswer<TYPE extends string, VALUE> = {
  type: TYPE;
  /** Null when the state does not contain a value for the field. */
  value: VALUE | null;
  /** Most likely value, also when `value` is null. */
  guess?: VALUE;
  /** Probability in [0, 1] that the state does not contain a value. */
  pNull?: number;
  /** Confidence in [0, 1] that `value` is correct. */
  confidence?: number;
  source?: ExtractionModelV4Source;
};

export type ExtractionModelV4Answer =
  | ValueAnswer<'text', string>
  | ValueAnswer<'number', number>
  | ValueAnswer<'date', string>
  | ValueAnswer<'time', string>
  | ValueAnswer<'datetime', string>
  | ValueAnswer<'duration', number>
  | {
      type: 'list';
      /** Null when the state does not contain a value for the field. */
      value: string[] | number[] | null;
      /** Probability in [0, 1] that the state does not contain a value. */
      pNull?: number;
      /** Confidence in [0, 1] that `value` is correct. */
      confidence?: number;
      /** One entry per value item, when available. */
      items?: Array<{
        confidence?: number;
        source?: ExtractionModelV4Source;
      }>;
    }
  | {
      /** The model declined to extract this field. Valid for any field type. */
      type: 'refusal';
    };

export type ExtractionModelV4Result = {
  /** Exactly one answer per field, under the original field IDs. */
  answers: Record<string, ExtractionModelV4Answer>;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
  warnings: SharedV4Warning[];
  providerMetadata?: SharedV4ProviderMetadata;
  response?: {
    id?: string;
    timestamp?: Date;
    modelId?: string;
    headers?: SharedV4Headers;
    body?: unknown;
  };
};

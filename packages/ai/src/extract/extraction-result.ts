import type {
  Experimental_ExtractionModelV4 as ExtractionModelV4,
  Experimental_ExtractionModelV4Field as ExtractionField,
  Experimental_ExtractionModelV4Result as ExtractionModelV4Result,
  Experimental_ExtractionModelV4Source as ExtractionSource,
} from '@ai-sdk/provider';

export type ExtractionModel = string | ExtractionModelV4;

export type ExtractionValue<FIELD extends ExtractionField> = FIELD extends {
  type: 'number' | 'duration';
}
  ? number
  : FIELD extends { type: 'list'; items: infer ITEMS }
    ? ITEMS extends 'number'
      ? number[]
      : string[]
    : string;

export type ExtractionAnswer<FIELD extends ExtractionField> = FIELD extends {
  type: 'list';
}
  ? {
      type: 'list';
      value: ExtractionValue<FIELD> | null;
      pNull?: number;
      confidence?: number;
      items?: Array<{ confidence?: number; source?: ExtractionSource }>;
    }
  : {
      type: FIELD['type'];
      value: ExtractionValue<FIELD> | null;
      guess?: ExtractionValue<FIELD>;
      pNull?: number;
      confidence?: number;
      source?: ExtractionSource;
    };

export type ExtractionResult<FIELDS extends Record<string, ExtractionField>> = {
  readonly answers: {
    [ID in keyof FIELDS]: ExtractionAnswer<FIELDS[ID]>;
  };
  readonly usage: {
    inputTokens: number | undefined;
    outputTokens: number | undefined;
    totalTokens: number | undefined;
  };
  readonly warnings: ExtractionModelV4Result['warnings'];
  readonly providerMetadata: ExtractionModelV4Result['providerMetadata'];
  readonly response: NonNullable<ExtractionModelV4Result['response']> & {
    timestamp: Date;
    modelId: string;
  };
};

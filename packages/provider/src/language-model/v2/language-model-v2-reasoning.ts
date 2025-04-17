/**
Reasoning that the model has generated.
 */
export type LanguageModelV2Reasoning =
  | {
      type: 'reasoning';
      reasoningType: 'text';
      text: string;
    }
  | {
      type: 'reasoning';
      reasoningType: 'signature';
      signature: string;
    }
  | {
      type: 'reasoning';
      reasoningType: 'redacted';
      data: string;
    };

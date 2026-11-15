import type { LanguageModelV4Source } from './language-model-v4-source';

/**
 * A reference supporting generated text. Citations are attached to the text
 * they support, independently of the complete set of retrieved sources.
 */
export type LanguageModelV4Citation = {
  /** The referenced URL or document. */
  source: LanguageModelV4Source;

  /** Start offset in the containing generated text, when supplied by the provider. */
  startIndex?: number;

  /** Exclusive end offset in the containing generated text, when supplied by the provider. */
  endIndex?: number;

  /** The supporting passage from the source, when supplied by the provider. */
  citedText?: string;
};

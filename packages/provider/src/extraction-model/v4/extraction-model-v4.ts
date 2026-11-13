import type { ExtractionModelV4CallOptions } from './extraction-model-v4-call-options';
import type { ExtractionModelV4Field } from './extraction-model-v4-field';
import type { ExtractionModelV4Result } from './extraction-model-v4-result';

/** Experimental extraction model contract. May change in patch releases. */
export type ExtractionModelV4 = {
  readonly specificationVersion: 'v4';
  readonly provider: string;
  readonly modelId: string;
  /** Supported field types, used to reject unsupported calls before any I/O. */
  readonly supportedFieldTypes: readonly ExtractionModelV4Field['type'][];
  /** Extract every field from the same state. No partial results. */
  doExtract(
    options: ExtractionModelV4CallOptions,
  ): PromiseLike<ExtractionModelV4Result>;
};

import type { Experimental_ExtractionModelV4 as ExtractionModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class ExtractionMockModelV4 implements ExtractionModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: string;
  readonly modelId: string;
  readonly supportedFieldTypes: ExtractionModelV4['supportedFieldTypes'];
  doExtract: ExtractionModelV4['doExtract'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    supportedFieldTypes = [
      'text',
      'number',
      'date',
      'time',
      'datetime',
      'duration',
      'list',
    ],
    doExtract = notImplemented,
  }: {
    provider?: string;
    modelId?: string;
    supportedFieldTypes?: ExtractionModelV4['supportedFieldTypes'];
    doExtract?: ExtractionModelV4['doExtract'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.supportedFieldTypes = supportedFieldTypes;
    this.doExtract = doExtract;
  }
}

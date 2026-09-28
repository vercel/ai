import type { Experimental_EvaluationModelV4 as EvaluationModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class EvaluationMockModelV4 implements EvaluationModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: string;
  readonly modelId: string;
  readonly supportedQuestionTypes: EvaluationModelV4['supportedQuestionTypes'];
  doEvaluate: EvaluationModelV4['doEvaluate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    supportedQuestionTypes = ['choice', 'score', 'boolean'],
    doEvaluate = notImplemented,
  }: {
    provider?: string;
    modelId?: string;
    supportedQuestionTypes?: EvaluationModelV4['supportedQuestionTypes'];
    doEvaluate?: EvaluationModelV4['doEvaluate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.supportedQuestionTypes = supportedQuestionTypes;
    this.doEvaluate = doEvaluate;
  }
}

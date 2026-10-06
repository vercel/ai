import type { Experimental_DecisionModelV4 as DecisionModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class DecisionMockModelV4 implements DecisionModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: string;
  readonly modelId: string;
  readonly supportedQuestionTypes: DecisionModelV4['supportedQuestionTypes'];
  doDecide: DecisionModelV4['doDecide'];

  /** @deprecated Use `doDecide` instead. */
  doEvaluate(options: Parameters<DecisionModelV4['doDecide']>[0]) {
    return this.doDecide(options);
  }

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    supportedQuestionTypes = ['choice', 'score', 'boolean'],
    doDecide,
    doEvaluate,
  }: {
    provider?: string;
    modelId?: string;
    supportedQuestionTypes?: DecisionModelV4['supportedQuestionTypes'];
    doDecide?: DecisionModelV4['doDecide'];
    /** @deprecated Use `doDecide` instead. */
    doEvaluate?: DecisionModelV4['doDecide'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.supportedQuestionTypes = supportedQuestionTypes;
    this.doDecide = doDecide ?? doEvaluate ?? notImplemented;
  }
}

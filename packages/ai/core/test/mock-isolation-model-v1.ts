import { IsolationModelV1 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockIsolationModelV1 implements IsolationModelV1 {
  readonly specificationVersion = 'v1';
  readonly provider: IsolationModelV1['provider'];
  readonly modelId: IsolationModelV1['modelId'];

  doGenerate: IsolationModelV1['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
  }: {
    provider?: IsolationModelV1['provider'];
    modelId?: IsolationModelV1['modelId'];
    doGenerate?: IsolationModelV1['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
  }
}

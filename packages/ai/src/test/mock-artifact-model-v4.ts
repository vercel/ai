import type { Experimental_ArtifactModelV4 } from '@ai-sdk/provider';
import { notImplemented } from './not-implemented';

export class MockArtifactModelV4 implements Experimental_ArtifactModelV4 {
  readonly specificationVersion = 'v4';
  readonly provider: Experimental_ArtifactModelV4['provider'];
  readonly modelId: Experimental_ArtifactModelV4['modelId'];

  doGenerate: Experimental_ArtifactModelV4['doGenerate'];

  constructor({
    provider = 'mock-provider',
    modelId = 'mock-model-id',
    doGenerate = notImplemented,
  }: {
    provider?: Experimental_ArtifactModelV4['provider'];
    modelId?: Experimental_ArtifactModelV4['modelId'];
    doGenerate?: Experimental_ArtifactModelV4['doGenerate'];
  } = {}) {
    this.provider = provider;
    this.modelId = modelId;
    this.doGenerate = doGenerate;
  }
}

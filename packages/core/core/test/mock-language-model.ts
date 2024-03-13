import { LanguageModel } from '../../ai-model-specification/index';

export class MockLanguageModel implements LanguageModel {
  doGenerate: LanguageModel['doGenerate'];
  doStream: LanguageModel['doStream'];

  readonly defaultObjectGenerationMode: LanguageModel['defaultObjectGenerationMode'];

  constructor({
    doGenerate = notImplemented,
    doStream = notImplemented,
    defaultObjectGenerationMode = undefined,
  }: {
    doGenerate?: LanguageModel['doGenerate'];
    doStream?: LanguageModel['doStream'];
    defaultObjectGenerationMode?: LanguageModel['defaultObjectGenerationMode'];
  }) {
    this.doGenerate = doGenerate;
    this.doStream = doStream;

    this.defaultObjectGenerationMode = defaultObjectGenerationMode;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}

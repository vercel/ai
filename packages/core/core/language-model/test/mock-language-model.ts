import { LanguageModel } from '..';

export class MockLanguageModel implements LanguageModel {
  doGenerate: LanguageModel['doGenerate'];
  doStream: LanguageModel['doStream'];
  doGenerateJsonText: LanguageModel['doGenerateJsonText'];
  doStreamJsonText: LanguageModel['doStreamJsonText'];

  constructor({
    doGenerate = notImplemented,
    doStream = notImplemented,
    doGenerateJsonText = notImplemented,
    doStreamJsonText = notImplemented,
  }: {
    doGenerate?: LanguageModel['doGenerate'];
    doStream?: LanguageModel['doStream'];
    doGenerateJsonText?: LanguageModel['doGenerateJsonText'];
    doStreamJsonText?: LanguageModel['doStreamJsonText'];
  }) {
    this.doGenerate = doGenerate;
    this.doStream = doStream;
    this.doGenerateJsonText = doGenerateJsonText;
    this.doStreamJsonText = doStreamJsonText;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}

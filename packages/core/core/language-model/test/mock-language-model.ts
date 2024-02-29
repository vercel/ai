import { LanguageModel, ObjectMode } from '..';

export class MockLanguageModel implements LanguageModel {
  doGenerate: LanguageModel['doGenerate'];
  doStream: LanguageModel['doStream'];
  doStreamJsonText: LanguageModel['doStreamJsonText'];

  _objectMode: ObjectMode | undefined;

  constructor({
    doGenerate = notImplemented,
    doStream = notImplemented,
    doStreamJsonText = notImplemented,
    objectMode,
  }: {
    doGenerate?: LanguageModel['doGenerate'];
    doStream?: LanguageModel['doStream'];
    doStreamJsonText?: LanguageModel['doStreamJsonText'];
    objectMode?: ObjectMode;
  }) {
    this.doGenerate = doGenerate;
    this.doStream = doStream;
    this.doStreamJsonText = doStreamJsonText;

    this._objectMode = objectMode;
  }

  get objectMode(): ObjectMode {
    if (this._objectMode === undefined) {
      throw new Error('objectMode not set');
    }

    return this._objectMode;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}

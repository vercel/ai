import { LanguageModel, ObjectMode } from '..';

export class MockLanguageModel implements LanguageModel {
  doGenerate: LanguageModel['doGenerate'];
  doStream: LanguageModel['doStream'];

  _objectMode: ObjectMode | undefined;

  constructor({
    doGenerate = notImplemented,
    doStream = notImplemented,
    objectMode,
  }: {
    doGenerate?: LanguageModel['doGenerate'];
    doStream?: LanguageModel['doStream'];
    objectMode?: ObjectMode;
  }) {
    this.doGenerate = doGenerate;
    this.doStream = doStream;

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

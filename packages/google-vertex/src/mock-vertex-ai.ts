import {
  GenerativeModel,
  ModelParams,
  RequestOptions,
  VertexAI,
} from '@google-cloud/vertexai';

export class MockVertexAI {
  readonly generateContent: GenerativeModel['generateContent'];

  constructor({
    generateContent = notImplemented,
  }: {
    generateContent?: GenerativeModel['generateContent'];
  }) {
    this.generateContent = generateContent;
  }

  createVertexAI(options: { project: string; location: string }): VertexAI {
    const self = this;
    return {
      getGenerativeModel(
        modelParams: ModelParams,
        requestOptions?: RequestOptions,
      ): GenerativeModel {
        return {
          generateContent: self.generateContent,
        } as GenerativeModel;
      },
    } as VertexAI;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}

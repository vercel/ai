import {
  GenerativeModel,
  ModelParams,
  RequestOptions,
  VertexAI,
} from '@google-cloud/vertexai';

export class MockVertexAI {
  readonly generateContent: GenerativeModel['generateContent'];
  readonly generateContentStream: GenerativeModel['generateContentStream'];

  constructor({
    generateContent = notImplemented,
    generateContentStream = notImplemented,
  }: {
    generateContent?: GenerativeModel['generateContent'];
    generateContentStream?: GenerativeModel['generateContentStream'];
  }) {
    this.generateContent = generateContent;
    this.generateContentStream = generateContentStream;
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
          generateContentStream: self.generateContentStream,
        } as GenerativeModel;
      },
    } as VertexAI;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}

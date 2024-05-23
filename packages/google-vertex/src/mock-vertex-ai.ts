import {
  GenerateContentResponse,
  GenerativeModel,
  ModelParams,
  RequestOptions,
  VertexAI,
} from '@google-cloud/vertexai';

export class MockVertexAI {
  readonly generateContent: GenerativeModel['generateContent'];
  readonly generateContentStream: () => AsyncGenerator<GenerateContentResponse>;

  lastModelParams?: ModelParams;

  constructor({
    generateContent = notImplemented,
    generateContentStream = notImplemented,
  }: {
    generateContent?: GenerativeModel['generateContent'];
    generateContentStream?: () => AsyncGenerator<GenerateContentResponse>;
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
        self.lastModelParams = modelParams;

        return {
          generateContent: self.generateContent,
          generateContentStream: async () => ({
            response: Promise.resolve({}),
            stream: self.generateContentStream?.(),
          }),
        } as unknown as GenerativeModel;
      },
    } as VertexAI;
  }
}

function notImplemented(): never {
  throw new Error('Not implemented');
}

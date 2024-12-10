import { mockClient } from 'aws-sdk-client-mock';
import { createAmazonBedrock } from './bedrock-provider';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrockMock = mockClient(BedrockRuntimeClient);

const dummyDocumentsIndices = [1, 0];
const dummyDocuments = ['sunny day at the beach', 'rainy day in the city'];

const provider = createAmazonBedrock({
  region: 'us-east-1',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  sessionToken: 'test-token-key',
});
const model = provider.reranking('amazon.rerank-v1');

describe('doRerank', () => {
  beforeEach(() => {
    bedrockMock.reset();
  });

  it('should rerank documents', async () => {
    const mockResponse = {
      results: [
        {
          index: 1,
          score: 0.8,
        },
        {
          index: 0,
          score: 0.7,
        },
      ],
    };

    bedrockMock.on(InvokeModelCommand).resolves({
      //@ts-ignore
      body: new TextEncoder().encode(JSON.stringify(mockResponse)),
    });

    const { rerankedIndices } = await model.doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(rerankedIndices).toStrictEqual(dummyDocumentsIndices);
  });

  it('should rerank documents and return documents', async () => {
    const mockResponse = {
      results: [
        {
          index: 1,
          score: 0.8,
        },
        {
          index: 0,
          score: 0.7,
        },
      ],
    };

    bedrockMock.on(InvokeModelCommand).resolves({
      //@ts-ignore
      body: new TextEncoder().encode(JSON.stringify(mockResponse)),
    });

    const { rerankedIndices, rerankedDocuments } = await model.doRerank({
      values: dummyDocuments,
      query: 'rainy day',
      topK: 2,
      returnDocuments: true,
    });

    expect(rerankedDocuments).toStrictEqual(
      dummyDocumentsIndices.map(index => dummyDocuments[index]),
    );

    expect(rerankedIndices).toStrictEqual(dummyDocumentsIndices);
  });
});

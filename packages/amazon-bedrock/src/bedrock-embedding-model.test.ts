import { mockClient } from 'aws-sdk-client-mock';
import { createAmazonBedrock } from './bedrock-provider';
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime';

const bedrockMock = mockClient(BedrockRuntimeClient);

const mockEmbeddings = [
  [
    [0.1, 0.2, 0.3, 0.4, 0.5],
    [0.6, 0.7, 0.8, 0.9, 1.0],
  ],
  [
    [0.2, 0.2, 0.3, 0.4, 0.5],
    [0.6, 0.7, 0.8, 0.9, 1.0],
  ],
];

const testValues = ['sunny day at the beach', 'rainy day in the city'];

const provider = createAmazonBedrock({
  region: 'us-east-1',
  accessKeyId: 'test-access-key',
  secretAccessKey: 'test-secret-key',
  sessionToken: 'test-token-key',
});

describe('doEmbed', () => {
  beforeEach(() => {
    bedrockMock.reset();
  });

  it('should handle single input value and return embeddings', async () => {
    const mockResponse = {
      embedding: mockEmbeddings[0],
      inputTextTokenCount: 8,
    };

    bedrockMock.on(InvokeModelCommand).resolves({
      //@ts-ignore
      body: new TextEncoder().encode(JSON.stringify(mockResponse)),
    });

    const { embeddings } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: [testValues[0]],
      });

    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toStrictEqual(mockResponse.embedding);
  });

  it('should handle single input value and extract usage', async () => {
    const mockResponse = {
      embedding: [],
      inputTextTokenCount: 8,
    };

    bedrockMock.on(InvokeModelCommand).resolves({
      //@ts-ignore
      body: new TextEncoder().encode(JSON.stringify(mockResponse)),
    });

    const { usage } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: [testValues[0]],
      });

    expect(usage?.tokens).toStrictEqual(8);
  });

  it('should handle multiple input values and return embeddings', async () => {
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({
        //@ts-ignore
        body: new TextEncoder().encode(
          JSON.stringify({
            embedding: mockEmbeddings[0],
            inputTextTokenCount: 8,
          }),
        ),
      })
      .resolvesOnce({
        //@ts-ignore
        body: new TextEncoder().encode(
          JSON.stringify({
            embedding: mockEmbeddings[1],
            inputTextTokenCount: 8,
          }),
        ),
      });

    const { embeddings } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: testValues,
      });

    expect(embeddings.length).toBe(2);
    expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);
    expect(embeddings[1]).toStrictEqual(mockEmbeddings[1]);
  });

  it('should handle multiple input values and extract usage', async () => {
    bedrockMock
      .on(InvokeModelCommand)
      .resolvesOnce({
        //@ts-ignore
        body: new TextEncoder().encode(
          JSON.stringify({
            embedding: [],
            inputTextTokenCount: 8,
          }),
        ),
      })
      .resolvesOnce({
        //@ts-ignore
        body: new TextEncoder().encode(
          JSON.stringify({
            embedding: [],
            inputTextTokenCount: 8,
          }),
        ),
      });

    const { usage } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: testValues,
      });

    expect(usage?.tokens).toStrictEqual(16);
  });
});

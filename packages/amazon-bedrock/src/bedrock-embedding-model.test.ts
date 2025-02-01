import { createTestServer } from '@ai-sdk/provider-utils/test';
import { createAmazonBedrock } from './bedrock-provider';

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

const embedUrl = `https://bedrock-runtime.us-east-1.amazonaws.com/model/${encodeURIComponent(
  'amazon.titan-embed-text-v2:0',
)}/invoke`;

describe('doEmbed', () => {
  const server = createTestServer({
    [embedUrl]: {
      response: {
        type: 'binary',
        headers: {
          'content-type': 'application/json',
        },
        body: Buffer.from(
          JSON.stringify({
            embedding: mockEmbeddings[0],
            inputTextTokenCount: 8,
          }),
        ),
      },
    },
  });

  const provider = createAmazonBedrock({
    region: 'us-east-1',
    accessKeyId: 'test-access-key',
    secretAccessKey: 'test-secret-key',
    sessionToken: 'test-token-key',
  });

  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    server.urls[embedUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          embedding: mockEmbeddings[0],
          inputTextTokenCount: 8,
        }),
      ),
    };
  });

  it('should handle single input value and return embeddings', async () => {
    const { embeddings } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: [testValues[0]],
      });

    expect(embeddings.length).toBe(1);
    expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);

    const body = await server.calls[0].requestBody;
    expect(body).toEqual({
      inputText: testValues[0],
    });
  });

  it('should handle single input value and extract usage', async () => {
    const { usage } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: [testValues[0]],
      });

    expect(usage?.tokens).toStrictEqual(8);
  });

  // TODO: Update unified test server to support dynamic responses.

  // it('should handle multiple input values and return embeddings', async () => {
  //   const { embeddings } = await provider
  //     .embedding('amazon.titan-embed-text-v2:0')
  //     .doEmbed({
  //       values: testValues,
  //     });

  //   expect(embeddings.length).toBe(2);
  //   expect(embeddings[0]).toStrictEqual(mockEmbeddings[0]);
  //   expect(embeddings[1]).toStrictEqual(mockEmbeddings[1]);

  //   const firstRequest = JSON.parse(await calls[0].requestBody);
  //   const secondRequest = JSON.parse(await calls[1].requestBody);
  //   expect(firstRequest).toEqual({ inputText: testValues[0] });
  //   expect(secondRequest).toEqual({ inputText: testValues[1] });
  // });

  it('should handle multiple input values and extract usage', async () => {
    const { usage } = await provider
      .embedding('amazon.titan-embed-text-v2:0')
      .doEmbed({
        values: testValues,
      });

    expect(usage?.tokens).toStrictEqual(16);
  });
});

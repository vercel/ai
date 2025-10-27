import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { injectFetchHeaders } from './inject-fetch-headers';
import { RerankedDocument } from '@ai-sdk/provider';
import { BedrockRerankingModel } from './bedrock-reranking-model';
import { UnsupportedFunctionalityError } from '@ai-sdk/provider';
import { beforeEach, describe, expect, it } from 'vitest';

const dummyResultDocuments: RerankedDocument<string>[] = [
  {
    index: 1,
    relevanceScore: 0.45028743,
    document: 'rainy day in the city',
  },
  {
    index: 0,
    relevanceScore: 0.0926305,
    document: 'sunny day at the beach',
  },
];

const testStringDocuments = ['sunny day at the beach', 'rainy day in the city'];

const rerankUrl = `https://bedrock-agent-runtime.us-east-1.amazonaws.com/rerank`;

const fakeFetchWithAuth = injectFetchHeaders({ 'x-amz-auth': 'test-auth' });
describe('doRerank', () => {
  const mockConfigHeaders = {
    'config-header': 'config-value',
    'shared-header': 'config-shared',
  };

  const server = createTestServer({
    [rerankUrl]: {
      response: {
        type: 'binary',
        headers: {
          'content-type': 'application/json',
        },
        body: Buffer.from(
          JSON.stringify({
            results: [
              {
                index: 1,
                relevanceScore: 0.45028743,
              },
              {
                index: 0,
                relevanceScore: 0.0926305,
              },
            ],
          }),
        ),
      },
    },
  });

  const model = new BedrockRerankingModel('cohere.rerank-v3-5:0', {
    baseUrl: () => 'https://bedrock-agent-runtime.us-east-1.amazonaws.com',
    region: 'us-west-2',
    headers: mockConfigHeaders,
    fetch: fakeFetchWithAuth,
  });

  let callCount = 0;

  beforeEach(() => {
    callCount = 0;
    server.urls[rerankUrl].response = {
      type: 'binary',
      headers: {
        'content-type': 'application/json',
      },
      body: Buffer.from(
        JSON.stringify({
          results: [
            {
              index: 1,
              relevanceScore: 0.45028743,
            },
            {
              index: 0,
              relevanceScore: 0.0926305,
            },
          ],
        }),
      ),
    };
  });

  it('should rerank documents', async () => {
    const { rerankedDocuments } = await model.doRerank({
      values: testStringDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(rerankedDocuments).toStrictEqual(dummyResultDocuments);
  });

  it('should expose the raw response headers', async () => {
    const { response } = await model.doRerank({
      values: testStringDocuments,
      query: 'rainy day',
      topK: 2,
    });

    expect(response?.headers).toStrictEqual({
      'content-length': '92',
      'content-type': 'application/json',
    });
  });

  it('should work with partial headers', async () => {
    const modelWithPartialHeaders = new BedrockRerankingModel(
      'cohere.rerank-v3-5:0',
      {
        baseUrl: () => 'https://bedrock-agent-runtime.us-east-1.amazonaws.com',
        region: 'us-west-2',
        headers: {
          'config-header': 'config-value',
        },
        fetch: injectFetchHeaders({
          'signed-header': 'signed-value',
          authorization: 'AWS4-HMAC-SHA256...',
        }),
      },
    );

    await modelWithPartialHeaders.doRerank({
      values: testStringDocuments,
      query: 'rainy day',
      topK: 2,
    });

    const requestHeaders = server.calls[0].requestHeaders;
    expect(requestHeaders['config-header']).toBe('config-value');
    expect(requestHeaders['signed-header']).toBe('signed-value');
    expect(requestHeaders['authorization']).toBe('AWS4-HMAC-SHA256...');
  });

  it('should rerank JSON documents', async () => {
    const jsonDocuments = [
      {
        from: 'Paul Doe <paul_fake_doe@oracle.com>',
        to: ['Steve <steve@me.com>', 'lisa@example.com'],
        date: '2024-03-27',
        subject: 'Follow-up',
        text: 'We are happy to give you the following pricing for your project.',
      },
      {
        from: 'John McGill <john_fake_mcgill@microsoft.com>',
        to: ['Steve <steve@me.com>'],
        date: '2024-03-28',
        subject: 'Missing Information',
        text: 'Sorry, but here is the pricing you asked for for the newest line of your models.',
      },
      {
        from: 'John McGill <john_fake_mcgill@microsoft.com>',
        to: ['Steve <steve@me.com>'],
        date: '2024-02-15',
        subject: 'Commited Pricing Strategy',
        text: 'I know we went back and forth on this during the call but the pricing for now should follow the agreement at hand.',
      },
    ];

    const expectedJsonResults: RerankedDocument<object>[] = [
      {
        index: 1,
        relevanceScore: 0.45028743,
        document: jsonDocuments[1],
      },
      {
        index: 0,
        relevanceScore: 0.0926305,
        document: jsonDocuments[0],
      },
    ];

    const { rerankedDocuments } = await model.doRerank({
      values: jsonDocuments,
      query: 'pricing information',
      topK: 2,
    });

    expect(rerankedDocuments).toStrictEqual(expectedJsonResults);
  });

  it('should throw error when using JSON documents with non-Cohere model', async () => {
    const nonCohereModel = new BedrockRerankingModel('amazon.rerank-v1:0', {
      baseUrl: () => 'https://bedrock-agent-runtime.us-east-1.amazonaws.com',
      region: 'us-west-2',
      headers: mockConfigHeaders,
      fetch: fakeFetchWithAuth,
    });

    const jsonDocuments = [
      {
        from: 'Paul Doe <paul_fake_doe@oracle.com>',
        to: ['Steve <steve@me.com>', 'lisa@example.com'],
        date: '2024-03-27',
        subject: 'Follow-up',
        text: 'We are happy to give you the following pricing for your project.',
      },
      {
        from: 'John McGill <john_fake_mcgill@microsoft.com>',
        to: ['Steve <steve@me.com>'],
        date: '2024-03-28',
        subject: 'Missing Information',
        text: 'Sorry, but here is the pricing you asked for for the newest line of your models.',
      },
    ];

    await expect(
      nonCohereModel.doRerank({
        values: jsonDocuments,
        query: 'pricing information',
        topK: 2,
      }),
    ).rejects.toThrow(UnsupportedFunctionalityError);

    await expect(
      nonCohereModel.doRerank({
        values: jsonDocuments,
        query: 'pricing information',
        topK: 2,
      }),
    ).rejects.toMatchObject({
      functionality: 'JSON documents',
      message: 'Only Cohere model supports JSON documents',
    });
  });
});

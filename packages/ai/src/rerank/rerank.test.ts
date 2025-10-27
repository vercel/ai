import { RerankingModelV3CallOptions } from '@ai-sdk/provider';
import { beforeEach, describe, expect, it } from 'vitest';
import { MockRerankingModelV3 } from '../test/mock-reranking-model-v3';
import { rerank } from './rerank';
import { RerankResult } from './rerank-result';

describe('rerank', () => {
  describe('rerank with string documents', () => {
    let result: RerankResult<string>;
    let calls: RerankingModelV3CallOptions[];

    beforeEach(async () => {
      calls = [];

      const model = new MockRerankingModelV3({
        doRerank: async options => {
          calls.push(options);
          return {
            ranking: [
              { index: 2, relevanceScore: 0.9 },
              { index: 0, relevanceScore: 0.8 },
              { index: 1, relevanceScore: 0.7 },
            ],
          };
        },
      });

      result = await rerank({
        model,
        documents: [
          'sunny day at the beach',
          'rainy day in the city',
          'cloudy day in the mountains',
        ],
        query: 'rainy day',
        topN: 3,
        providerOptions: {
          aProvider: { someKey: 'someValue' },
        },
      });
    });

    it('should call the model with the correct options', () => {
      expect(calls).toMatchInlineSnapshot(`
        [
          {
            "abortSignal": undefined,
            "documents": {
              "type": "text",
              "values": [
                "sunny day at the beach",
                "rainy day in the city",
                "cloudy day in the mountains",
              ],
            },
            "headers": undefined,
            "providerOptions": {
              "aProvider": {
                "someKey": "someValue",
              },
            },
            "query": "rainy day",
            "topN": 3,
          },
        ]
      `);
    });
  });

  // describe('result.reranking', () => {
  //   it('should reranking documents', async () => {
  //     const result = await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(testDocuments, dummyRerankedDocuments),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //     });

  //     assert.deepStrictEqual(result.rerankedDocuments, dummyRerankedDocuments);
  //   });
  // });

  // describe('result.response', () => {
  //   it('should include response in the result', async () => {
  //     const result = await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(testDocuments, dummyRerankedDocuments),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //     });

  //     expect(result.response).toMatchSnapshot();
  //   });
  // });

  // describe('result.value', () => {
  //   it('should include value in the result', async () => {
  //     const result = await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(testDocuments, dummyRerankedDocuments),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //     });

  //     assert.deepStrictEqual(result.rerankedDocuments, dummyRerankedDocuments);
  //   });
  // });

  // describe('result.usage', () => {
  //   it('should include usage in the result', async () => {
  //     const result = await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(testDocuments, dummyRerankedDocuments, {
  //           tokens: 30,
  //         }),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //     });

  //     assert.deepStrictEqual(result.usage, { tokens: 30 });
  //   });
  // });
  // describe('result.providerMetadata', () => {
  //   it('should include provider metadata when returned by the model', async () => {
  //     const providerMetadata = {
  //       gateway: {
  //         routing: {
  //           resolvedProvider: 'test-provider',
  //         },
  //       },
  //     };

  //     const result = await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(
  //           testDocuments,
  //           dummyRerankedDocuments,
  //           undefined,
  //           {
  //             headers: {},
  //             body: {},
  //           },
  //           providerMetadata,
  //         ),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //     });

  //     expect(result.providerMetadata).toStrictEqual(providerMetadata);
  //   });
  // });

  // describe('options.headers', () => {
  //   it('should set headers', async () => {
  //     const result = await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: async ({ headers }) => {
  //           assert.deepStrictEqual(headers, {
  //             'custom-request-header': 'request-header-value',
  //           });

  //           return { rerankedDocuments: dummyRerankedDocuments };
  //         },
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //       headers: { 'custom-request-header': 'request-header-value' },
  //     });

  //     assert.deepStrictEqual(result.rerankedDocuments, dummyRerankedDocuments);
  //   });
  // });

  // describe('options.providerOptions', () => {
  //   it('should pass provider options to model', async () => {
  //     const model = new MockRerankingModelV3({
  //       doRerank: async ({ providerOptions }) => {
  //         return {
  //           rerankedDocuments: [dummyRerankedDocuments[0]],
  //         };
  //       },
  //     });

  //     vi.spyOn(model, 'doRerank');

  //     await rerank({
  //       model,
  //       values: ['test-input'],
  //       providerOptions: {
  //         aProvider: { someKey: 'someValue' },
  //       },
  //       query: 'test-query',
  //       topK: 1,
  //     });

  //     expect(model.doRerank).toHaveBeenCalledWith({
  //       abortSignal: undefined,
  //       headers: undefined,
  //       providerOptions: {
  //         aProvider: { someKey: 'someValue' },
  //       },
  //       values: ['test-input'],
  //       query: 'test-query',
  //       topK: 1,
  //     });
  //   });
  // });

  // describe('telemetry', () => {
  //   let tracer: MockTracer;

  //   beforeEach(() => {
  //     tracer = new MockTracer();
  //   });

  //   it('should not record any telemetry data when not explicitly enabled', async () => {
  //     await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(testDocuments, dummyRerankedDocuments),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //     });
  //     assert.deepStrictEqual(tracer.jsonSpans, []);
  //   });

  //   it('should record telemetry data when enabled (single call path)', async () => {
  //     await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(testDocuments, dummyRerankedDocuments, {
  //           tokens: 10,
  //         }),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //       experimental_telemetry: {
  //         isEnabled: true,
  //         functionId: 'test-function-id',
  //         metadata: {
  //           test1: 'value1',
  //           test2: false,
  //         },
  //         tracer,
  //       },
  //     });

  //     expect(tracer.jsonSpans).toMatchSnapshot();
  //   });

  //   it('should not record telemetry inputs / outputs when disabled', async () => {
  //     await rerank({
  //       model: new MockRerankingModelV3({
  //         doRerank: mockRerank(testDocuments, dummyRerankedDocuments),
  //       }),
  //       values: testDocuments,
  //       query,
  //       topK,
  //       experimental_telemetry: {
  //         isEnabled: true,
  //         recordInputs: false,
  //         recordOutputs: false,
  //         tracer,
  //       },
  //     });

  //     expect(tracer.jsonSpans).toMatchSnapshot();
  //   });
  // });

  // describe('maxDocumentsPerCall validation', () => {
  //   it('should throw TooManyDocumentsForRerankingError when documents exceed maxDocumentsPerCall', async () => {
  //     const maxDocumentsPerCall = 2;
  //     const tooManyDocuments = [
  //       'document 1',
  //       'document 2',
  //       'document 3', // This exceeds the limit
  //     ];

  //     const model = new MockRerankingModelV3({
  //       provider: 'test-provider',
  //       modelId: 'test-model',
  //       maxDocumentsPerCall,
  //       doRerank: mockRerank(tooManyDocuments, dummyRerankedDocuments),
  //     });

  //     try {
  //       await rerank({
  //         model,
  //         values: tooManyDocuments,
  //         query: 'test query',
  //         topK: 2,
  //       });
  //       expect.fail('Expected TooManyDocumentsForRerankingError to be thrown');
  //     } catch (error) {
  //       expect(TooManyDocumentsForRerankingError.isInstance(error)).toBe(true);
  //     }
  //   });
  // });
});

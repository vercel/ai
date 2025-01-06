import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { ReplicateImageModel } from './replicate-image-model';
import { describe, it, expect } from 'vitest';

const prompt = 'The Loch Ness Monster getting a manicure';

const model = new ReplicateImageModel('black-forest-labs/flux-schnell', {
  provider: 'replicate',
  baseURL: 'https://api.replicate.com/v1',
  headers: { 'Authorization': 'Bearer test-token' },
});

describe('ReplicateImageModel', () => {
  describe('doGenerate', () => {
    const server = new JsonTestServer(
      'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
    );

    server.setupTestEnvironment();

    function prepareJsonResponse() {
      server.responseBodyJson = {
        output: [
          'https://replicate.delivery/image1.png',
          'https://replicate.delivery/image2.png',
        ],
      };
    }

    it('should pass the correct parameters', async () => {
      prepareJsonResponse();

      await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        providerOptions: { 
          replicate: { 
            input: { 
              num_inference_steps: 10 
            } 
          } 
        },
      });

      expect(await server.getRequestBodyJson()).toStrictEqual({
        input: {
          prompt,
          num_outputs: 2,
          num_inference_steps: 10,
        },
      });
    });

    it('should pass headers', async () => {
      prepareJsonResponse();

      const modelWithHeaders = new ReplicateImageModel('black-forest-labs/flux-schnell', {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com/v1',
        headers: {
          'Authorization': 'Bearer test-token',
          'Custom-Provider-Header': 'provider-header-value',
        },
      });

      await modelWithHeaders.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        providerOptions: {},
        headers: {
          'Custom-Request-Header': 'request-header-value',
        },
      });

      const requestHeaders = await server.getRequestHeaders();

      expect(requestHeaders).toStrictEqual({
        'authorization': 'Bearer test-token',
        'content-type': 'application/json',
        'custom-provider-header': 'provider-header-value',
        'custom-request-header': 'request-header-value',
      });
    });

    it('should extract the generated images', async () => {
      prepareJsonResponse();

      const result = await model.doGenerate({
        prompt,
        n: 2,
        size: undefined,
        providerOptions: {},
      });

      expect(result.images).toStrictEqual([
        'https://replicate.delivery/image1.png',
        'https://replicate.delivery/image2.png',
      ]);
    });

    it('throws when size is specified', async () => {
      await expect(
        model.doGenerate({
          prompt: 'test prompt',
          n: 1,
          size: '1024x1024',
          providerOptions: {},
        }),
      ).rejects.toThrow(/Replicate does not support the `size` option./);
    });
  });

  describe('e2e integration with the real Replicate API', () => {
    // Skip if no API token is provided
    it.runIf(process.env.REPLICATE_API_TOKEN)('should generate an image', async () => {
      const modelWithAuth = new ReplicateImageModel('black-forest-labs/flux-schnell', {
        provider: 'replicate',
        baseURL: 'https://api.replicate.com/v1',
        headers: { 
          Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`, 

          // https://replicate.fyi/prefer-header
          Prefer: 'wait'
        },
      });

      const { images } = await modelWithAuth.doGenerate({
        prompt,
        n: 1,
        size: undefined,
        providerOptions: {
          replicate: {
            input: {
              num_inference_steps: 2
            }
          }
        }
      });
      
      expect(images).toHaveLength(1);
      expect(images[0]).toMatch(/^https:\/\/replicate\.delivery\/.+/);
    }, 30000);
  });
}); 
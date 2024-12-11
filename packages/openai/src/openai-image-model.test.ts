import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createOpenAI } from './openai-provider';

const prompt = 'A cute baby sea otter';

const provider = createOpenAI({ apiKey: 'test-api-key' });
const model = provider.image('dall-e-3');

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://api.openai.com/v1/images/generations',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse() {
    server.responseBodyJson = {
      created: 1733837122,
      data: [
        {
          revised_prompt:
            'A charming visual illustration of a baby sea otter swimming joyously.',
          b64_json: 'base64-image-1',
        },
        {
          b64_json: 'base64-image-2',
        },
      ],
    };
  }

  it('should pass the model and the settings', async () => {
    prepareJsonResponse();

    await model.doGenerate({
      prompt,
      n: 2,
      size: '1024x1024',
      providerOptions: { openai: { style: 'vivid' } },
    });

    expect(await server.getRequestBodyJson()).toStrictEqual({
      model: 'dall-e-3',
      prompt,
      n: 2,
      size: '1024x1024',
      style: 'vivid',
      response_format: 'b64_json',
    });
  });

  it('should pass headers', async () => {
    prepareJsonResponse();

    const provider = createOpenAI({
      apiKey: 'test-api-key',
      organization: 'test-organization',
      project: 'test-project',
      headers: {
        'Custom-Provider-Header': 'provider-header-value',
      },
    });

    await provider.image('dall-e-3').doGenerate({
      prompt,
      n: 2,
      size: '1024x1024',
      providerOptions: { openai: { style: 'vivid' } },
      headers: {
        'Custom-Request-Header': 'request-header-value',
      },
    });

    const requestHeaders = await server.getRequestHeaders();

    expect(requestHeaders).toStrictEqual({
      authorization: 'Bearer test-api-key',
      'content-type': 'application/json',
      'custom-provider-header': 'provider-header-value',
      'custom-request-header': 'request-header-value',
      'openai-organization': 'test-organization',
      'openai-project': 'test-project',
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

    expect(result.images).toStrictEqual(['base64-image-1', 'base64-image-2']);
  });
});

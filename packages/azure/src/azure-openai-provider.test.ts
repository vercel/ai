import { LanguageModelV1Prompt } from '@ai-sdk/provider';
import { JsonTestServer } from '@ai-sdk/provider-utils/test';
import { createAzure } from './azure-openai-provider';

const TEST_PROMPT: LanguageModelV1Prompt = [
  { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
];

describe('doGenerate', () => {
  const server = new JsonTestServer(
    'https://test-resource.openai.azure.com/openai/deployments/test-deployment/chat/completions?api-version=2024-05-01-preview',
  );

  server.setupTestEnvironment();

  function prepareJsonResponse({ content = '' }: { content?: string } = {}) {
    server.responseBodyJson = {
      id: 'chatcmpl-95ZTZkhr0mHNKqerQfiwkuox3PHAd',
      object: 'chat.completion',
      created: 1711115037,
      model: 'gpt-3.5-turbo-0125',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content,
          },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 4,
        total_tokens: 34,
        completion_tokens: 30,
      },
      system_fingerprint: 'fp_3bc1b5746c',
    };
  }

  it('should pass the api key as Authorization header', async () => {
    prepareJsonResponse();

    const provider = createAzure({
      resourceName: 'test-resource',
      apiKey: 'test-api-key',
    });

    await provider('test-deployment').doGenerate({
      inputFormat: 'prompt',
      mode: { type: 'regular' },
      prompt: TEST_PROMPT,
    });

    expect((await server.getRequestHeaders()).get('api-key')).toStrictEqual(
      'test-api-key',
    );
  });
});

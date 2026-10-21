import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { describe, expect, it } from 'vitest';
import { createAzure } from './azure-openai-provider';

const baseURL = 'https://test-resource.openai.azure.com/openai';
const deploymentId = 'production-chat';
const modelId = 'gpt-5';
const responseModelId = 'gpt-5-2025-08-07';
const paths = {
  responses: '/responses',
  chat: '/chat/completions',
  completion: '/completions',
};
const urls = Object.values(paths).flatMap(path => [
  `${baseURL}/v1${path}`,
  `${baseURL}/deployments/${deploymentId}${path}`,
]);
const server = createTestServer(Object.fromEntries(urls.map(url => [url, {}])));
const callOptions: LanguageModelV4CallOptions = {
  prompt: [
    { role: 'system', content: 'Be helpful.' },
    { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
  ],
  temperature: 0.5,
};

describe('separate Azure deployment and model IDs', () => {
  const provider = createAzure({
    resourceName: 'test-resource',
    apiKey: 'test-api-key',
  });

  it.each([
    'default',
    'languageModel',
    'responses',
    'chat',
    'completion',
  ] as const)(
    '%s reports the supplied model ID and falls back to the deployment ID',
    factory => {
      const createModel = factory === 'default' ? provider : provider[factory];
      expect(createModel(deploymentId, { modelId }).modelId).toBe(modelId);
      expect(createModel(deploymentId, {}).modelId).toBe(deploymentId);
      expect(createModel(deploymentId, { modelId: undefined }).modelId).toBe(
        deploymentId,
      );
      expect(createModel(deploymentId).modelId).toBe(deploymentId);
      expect(createModel(deploymentId, undefined).modelId).toBe(deploymentId);
    },
  );

  describe.each([false, true])(
    'deployment-based URLs: %s',
    useDeploymentBasedUrls => {
      const provider = createAzure({
        resourceName: 'test-resource',
        apiKey: 'test-api-key',
        useDeploymentBasedUrls,
      });

      describe.each(['responses', 'chat', 'completion'] as const)('%s', api => {
        const url = useDeploymentBasedUrls
          ? `${baseURL}/deployments/${deploymentId}${paths[api]}`
          : `${baseURL}/v1${paths[api]}`;
        const response =
          api === 'responses'
            ? {
                id: 'resp-test',
                created_at: 1741257730,
                model: responseModelId,
                output: [],
                status: 'completed',
                usage: { input_tokens: 4, output_tokens: 0, total_tokens: 4 },
              }
            : {
                id: 'chatcmpl-test',
                created: 1741257730,
                model: responseModelId,
                choices: [
                  {
                    index: 0,
                    message: { role: 'assistant', content: 'Hello' },
                    text: 'Hello',
                    finish_reason: 'stop',
                  },
                ],
                usage: {
                  prompt_tokens: 4,
                  completion_tokens: 1,
                  total_tokens: 5,
                },
              };

        it.each(['generate', 'stream'] as const)(
          '%s routes by deployment and infers capabilities from the model ID',
          async operation => {
            const model = provider[api](deploymentId, { modelId });
            if (operation === 'generate') {
              server.urls[url].response = {
                type: 'json-value',
                body: response,
              };
              const result = await model.doGenerate(callOptions);
              expect(result.response?.modelId).toBe(responseModelId);
            } else {
              const chunks =
                api === 'responses'
                  ? [
                      { type: 'response.created', response },
                      { type: 'response.completed', response },
                    ]
                  : [
                      {
                        id: 'chatcmpl-test',
                        created: 1741257730,
                        model: responseModelId,
                        choices: [
                          {
                            index: 0,
                            delta: { role: 'assistant', content: 'Hello' },
                            text: 'Hello',
                            finish_reason: 'stop',
                          },
                        ],
                      },
                    ];
              server.urls[url].response = {
                type: 'stream-chunks',
                chunks: [
                  ...chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`),
                  'data: [DONE]\n\n',
                ],
              };
              const result = await model.doStream(callOptions);
              const parts = await convertReadableStreamToArray(result.stream);
              expect(parts.some(part => part.type === 'error')).toBe(false);
              expect(parts).toContainEqual(
                expect.objectContaining({
                  type: 'response-metadata',
                  modelId: responseModelId,
                }),
              );
            }

            const request = await server.calls[0].requestBodyJson;
            expect(request.model).toBe(deploymentId);
            if (api === 'completion') {
              expect(request.temperature).toBe(0.5);
            } else {
              expect(request.temperature).toBeUndefined();
              expect(
                (api === 'responses' ? request.input : request.messages)[0]
                  .role,
              ).toBe('developer');
            }
          },
        );
      });
    },
  );
});

import type {
  LanguageModelV3Prompt,
  SharedV3ProviderOptions,
} from '@ai-sdk/provider';
import { convertReadableStreamToArray } from '@ai-sdk/provider-utils/test';
import { createTestServer } from '@ai-sdk/test-server/with-vitest';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createAzure } from './azure-openai-provider';

const url = 'https://test-resource.openai.azure.com/openai/v1/responses';
const server = createTestServer({ [url]: {} });
const provider = createAzure({
  apiKey: 'test-key',
  resourceName: 'test-resource',
});
const tool = {
  type: 'function' as const,
  name: 'lookup',
  inputSchema: { type: 'object' as const, properties: {} },
  strict: true,
};
const cases: Array<{
  name: string;
  options: SharedV3ProviderOptions;
  expectedName: string | undefined;
}> = [
  {
    name: 'native azure',
    options: { azure: { additionalTools: [tool] } },
    expectedName: 'lookup',
  },
  {
    name: 'openai fallback',
    options: { openai: { additionalTools: [tool] } },
    expectedName: 'lookup',
  },
  {
    name: 'azure precedence',
    options: {
      azure: { additionalTools: [{ ...tool, name: 'azure_lookup' }] },
      openai: { additionalTools: [tool] },
    },
    expectedName: 'azure_lookup',
  },
  {
    name: 'explicit empty azure',
    options: { azure: {}, openai: { additionalTools: [tool] } },
    expectedName: undefined,
  },
];
describe('Azure positioned additional tools', () => {
  for (const method of ['generate', 'stream']) {
    it.each(cases)(
      '$name through ' + method,
      async ({ options, expectedName }) => {
        const prompt: LanguageModelV3Prompt = [
          { role: 'user', content: [{ type: 'text', text: 'hello' }] },
          { role: 'system', content: '', providerOptions: options },
        ];
        const model = provider.responses('gpt-6-astra');
        if (method === 'generate') {
          server.urls[url].response = {
            type: 'json-value',
            body: JSON.parse(
              readFileSync('src/__fixtures__/azure-text.1.json', 'utf8'),
            ),
          };
          await model.doGenerate({ prompt });
        } else {
          server.urls[url].response = {
            type: 'stream-chunks',
            chunks: readFileSync(
              'src/__fixtures__/azure-text.1.chunks.txt',
              'utf8',
            )
              .split('\n')
              .filter(Boolean)
              .map(line => `data: ${line}\n\n`),
          };
          const { stream } = await model.doStream({ prompt });
          await convertReadableStreamToArray(stream);
        }
        const body = await server.calls[0].requestBodyJson;
        expect(body.input[1]).toEqual(
          expectedName == null
            ? { role: 'developer', content: '' }
            : {
                type: 'additional_tools',
                role: 'developer',
                tools: [
                  {
                    type: 'function',
                    name: expectedName,
                    parameters: tool.inputSchema,
                    strict: true,
                  },
                ],
              },
        );
      },
    );
  }
  it('rejects invalid azure options instead of reading openai fallback', async () => {
    await expect(
      provider.responses('gpt-6-astra').doGenerate({
        prompt: [
          {
            role: 'system',
            content: '',
            providerOptions: {
              azure: { additionalTools: 'invalid' },
              openai: { additionalTools: [tool] },
            },
          },
        ],
      }),
    ).rejects.toThrow();
    expect(server.calls).toHaveLength(0);
  });
});

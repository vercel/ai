import { createAzure } from '@ai-sdk/azure';
import assert from 'node:assert/strict';

async function captureResponsesUrl(baseURL: string): Promise<string> {
  let requestUrl: string | undefined;

  const azure = createAzure({
    apiKey: 'test-api-key',
    baseURL,
    fetch: async input => {
      requestUrl = input instanceof Request ? input.url : String(input);
      return new Response('{}', {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    },
  });

  try {
    await azure.responses('test-deployment').doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hello' }],
        },
      ],
    });
  } catch {
    // The intercepted response is intentionally an error; only its URL matters.
  }

  assert.ok(requestUrl, `No request was made for baseURL ${baseURL}`);
  return requestUrl;
}

async function main() {
  const cases = [
    {
      name: 'Azure OpenAI resource hostname',
      baseURL: 'https://test-resource.openai.azure.com/openai',
      expected:
        'https://test-resource.openai.azure.com/openai/v1/responses?api-version=v1',
    },
    {
      name: 'Foundry resource hostname',
      baseURL: 'https://test-resource.services.ai.azure.com/openai',
      expected:
        'https://test-resource.services.ai.azure.com/openai/v1/responses?api-version=v1',
    },
    {
      name: 'Cognitive Services resource hostname',
      baseURL: 'https://test-resource.cognitiveservices.azure.com/openai',
      expected:
        'https://test-resource.cognitiveservices.azure.com/openai/v1/responses?api-version=v1',
    },
    {
      name: 'complete Foundry v1 URL',
      baseURL: 'https://test-resource.services.ai.azure.com/openai/v1',
      expected:
        'https://test-resource.services.ai.azure.com/openai/v1/responses',
    },
    {
      name: 'Foundry project URL',
      baseURL:
        'https://test-resource.services.ai.azure.com/api/projects/test-project/openai',
      expected:
        'https://test-resource.services.ai.azure.com/api/projects/test-project/openai/v1/responses',
    },
    {
      name: 'custom gateway URL',
      baseURL: 'https://gateway.example.com/azure/openai',
      expected: 'https://gateway.example.com/azure/openai/responses',
    },
  ] as const;

  for (const testCase of cases) {
    const actual = await captureResponsesUrl(testCase.baseURL);
    console.log(`${testCase.name}: ${actual}`);
    assert.equal(
      actual,
      testCase.expected,
      `${testCase.name} routed to the wrong Responses API URL`,
    );
  }

  console.log(
    'PASS: Azure resource hostnames include /openai/v1/responses while complete v1, project, and custom gateway URLs preserve their routing contracts.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import { createAzure } from '@ai-sdk/azure';
import assert from 'node:assert/strict';

async function captureResponsesUrl(baseURL: string) {
  let capturedUrl: string | undefined;
  const azure = createAzure({
    apiKey: 'test',
    baseURL,
    fetch: input => {
      capturedUrl = input instanceof Request ? input.url : String(input);
      return Promise.resolve(new Response('{}', { status: 500 }));
    },
  });

  try {
    await azure.responses('my-deployment').doStream({
      prompt: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    });
  } catch {
    // The intercepted response is intentionally an error; only its URL matters.
  }

  assert.ok(capturedUrl, `no request captured for ${baseURL}`);
  return new URL(capturedUrl);
}

async function main() {
  const azureResourceHosts = [
    'myresource.openai.azure.com',
    'myresource.services.ai.azure.com',
    'myresource.cognitiveservices.azure.com',
  ];

  for (const hostname of azureResourceHosts) {
    const requestUrl = await captureResponsesUrl(`https://${hostname}/openai`);

    assert.equal(
      requestUrl.pathname,
      '/openai/v1/responses',
      `${hostname} omitted the required /v1 path segment`,
    );
    assert.equal(requestUrl.searchParams.get('api-version'), 'v1');
    console.log(`${hostname} -> ${requestUrl.pathname}${requestUrl.search}`);
  }

  const completeV1Url = await captureResponsesUrl(
    'https://myresource.services.ai.azure.com/openai/v1/',
  );
  assert.equal(completeV1Url.pathname, '/openai/v1/responses');
  assert.equal(
    completeV1Url.search,
    '',
    'a complete Azure OpenAI v1 base URL should be used as-is',
  );

  const foundryProjectUrl = await captureResponsesUrl(
    'https://myresource.services.ai.azure.com/api/projects/my-project/openai',
  );
  assert.equal(
    foundryProjectUrl.pathname,
    '/api/projects/my-project/openai/v1/responses',
  );
  assert.equal(
    foundryProjectUrl.search,
    '',
    'a Foundry project URL should not receive an api-version parameter',
  );

  const customGatewayUrl = await captureResponsesUrl(
    'https://gateway.example.com/openai',
  );
  assert.equal(
    customGatewayUrl.pathname,
    '/openai/responses',
    'a non-Azure custom gateway should retain pass-through routing',
  );
  assert.equal(customGatewayUrl.search, '');

  console.log(
    'Issue #19817 not reproduced: every first-party Azure resource hostname includes /openai/v1/responses.',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

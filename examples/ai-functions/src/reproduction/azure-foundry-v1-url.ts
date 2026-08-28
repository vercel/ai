import assert from 'node:assert/strict';
import { createAzure } from '../../../../packages/azure/src';

const hosts = [
  'https://myresource.openai.azure.com',
  'https://myresource.services.ai.azure.com',
  'https://myresource.cognitiveservices.azure.com',
];

async function urlFor(baseURL: string): Promise<string> {
  let seen = '';
  const azure = createAzure({
    apiKey: 'test',
    baseURL,
    fetch: input => {
      seen = input instanceof Request ? input.url : String(input);
      return Promise.resolve(new Response('{}', { status: 500 }));
    },
  });

  await azure
    .responses('my-deployment')
    .doStream({
      prompt: [
        {
          role: 'user',
          content: [{ type: 'text', text: 'hi' }],
        },
      ],
    })
    .catch(() => {});

  return seen;
}

async function main() {
  for (const host of hosts) {
    const requestUrl = await urlFor(`${host}/openai`);
    const parsedUrl = new URL(requestUrl);

    assert.equal(
      parsedUrl.pathname,
      '/openai/v1/responses',
      `${parsedUrl.hostname} omitted the /openai/v1 path`,
    );

    console.log(`${parsedUrl.hostname} -> ${parsedUrl.pathname}`);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});

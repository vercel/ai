import { once } from 'node:events';
import { createServer } from 'node:http';
import { experimental_decide } from 'ai';

const server = createServer((request, response) => {
  if (
    request.method !== 'POST' ||
    request.url !== '/v1/systemone' ||
    request.headers.authorization !== 'Bearer local-example-key'
  ) {
    response.writeHead(400).end();
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      model: 'local-jev',
      answers: {
        usedConfiguredEndpoint: {
          type: 'noul',
          noul: 1,
        },
      },
    }),
  );
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');

try {
  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Expected the local server to listen on a TCP port.');
  }

  process.env.TYPESAFE_AI_API_KEY = 'local-example-key';
  process.env.TYPESAFE_AI_BASE_URL = `http://127.0.0.1:${address.port}/v1/`;

  // The default provider reads TYPESAFE_AI_BASE_URL when its module is loaded.
  const { typeSafeAi } = await import('@ai-sdk/typesafe-ai');

  const result = await experimental_decide({
    model: typeSafeAi.decisionModel('jev-latest'),
    state: 'This decision should use the local compatible server.',
    questions: {
      usedConfiguredEndpoint: {
        type: 'boolean',
        instructions: 'Did this request reach the configured endpoint?',
      },
    },
  });

  console.log(result.answers.usedConfiguredEndpoint.probability);
  console.log(result.response.modelId);
} finally {
  server.close();
  await once(server, 'close');
}

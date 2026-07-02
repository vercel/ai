import http from 'node:http';
import { once } from 'node:events';

const requests = [];

const server = http.createServer(async (req, res) => {
  let body = '';
  req.setEncoding('utf8');
  for await (const chunk of req) {
    body += chunk;
  }

  requests.push({
    method: req.method,
    url: req.url,
    headers: req.headers,
    body,
  });

  if (req.method === 'POST' && req.url === '/v1/messages') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        type: 'message',
        id: 'msg_repro_15580',
        model: 'claude-3-haiku-20240307',
        content: [{ type: 'text', text: 'hello from normalized endpoint' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    );
    return;
  }

  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(
    JSON.stringify({
      type: 'error',
      error: { type: 'not_found_error', message: 'Not Found' },
    }),
  );
});

server.listen(0, '127.0.0.1');
await once(server, 'listening');

const { port } = server.address();
const bareHostBaseURL = `http://127.0.0.1:${port}`;

process.env.ANTHROPIC_BASE_URL = bareHostBaseURL;
process.env.ANTHROPIC_API_KEY = 'test-api-key';

try {
  // Import the built workspace packages directly so this script can run from a
  // monorepo checkout without requiring published npm package links at the root.
  const { anthropic } = await import('./dist/index.js');
  const { generateText } = await import('../ai/dist/index.js');

  const result = await generateText({
    model: anthropic('claude-3-haiku-20240307'),
    prompt: 'Say hello',
  });

  console.log('generateText succeeded:', result.text);
  console.log('requests:', JSON.stringify(requests, null, 2));

  if (requests[0]?.url !== '/v1/messages') {
    throw new Error(
      `Expected normalized request path /v1/messages, got ${requests[0]?.url}`,
    );
  }
} catch (error) {
  console.error('generateText failed:', error);
  console.error('requests:', JSON.stringify(requests, null, 2));

  if (
    requests[0]?.url === '/messages' &&
    error instanceof Error &&
    error.message.includes('Not Found')
  ) {
    throw new Error(
      'Reproduced issue #15580: ANTHROPIC_BASE_URL bare host was not normalized; request went to /messages and returned Not Found.',
      { cause: error },
    );
  }

  throw error;
} finally {
  server.close();
}

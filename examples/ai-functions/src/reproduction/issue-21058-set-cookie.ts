import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import {
  createTextStreamResponse,
  createUIMessageStreamResponse,
  pipeTextStreamToResponse,
  pipeUIMessageStreamToResponse,
  type UIMessageChunk,
} from 'ai';

const cookies = [
  'theme=light; Path=/; Expires=Wed, 21 Oct 2030 07:28:00 GMT',
  'locale=en; Path=/',
];
const controlHeader = 'preserved';

type HeaderInput = Headers | [string, string][];

function createHeaders(kind: 'headers' | 'pairs'): HeaderInput {
  if (kind === 'pairs') {
    return [
      ['set-cookie', cookies[0]],
      ['set-cookie', cookies[1]],
      ['x-reproduction-control', controlHeader],
    ];
  }

  const headers = new Headers({
    'x-reproduction-control': controlHeader,
  });
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie);
  }
  return headers;
}

function createTextStream() {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue('Synthetic text.');
      controller.close();
    },
  });
}

function createUIStream() {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'text-start', id: 'synthetic-text' });
      controller.enqueue({
        type: 'text-delta',
        id: 'synthetic-text',
        delta: 'Synthetic UI text.',
      });
      controller.enqueue({ type: 'text-end', id: 'synthetic-text' });
      controller.close();
    },
  });
}

async function main() {
  for (const kind of ['headers', 'pairs'] as const) {
    const textResponse = createTextStreamResponse({
      headers: createHeaders(kind),
      textStream: createTextStream(),
    });
    assert.deepEqual(
      textResponse.headers.getSetCookie(),
      cookies,
      `createTextStreamResponse must preserve both cookies for ${kind}`,
    );
    await textResponse.text();

    const uiResponse = createUIMessageStreamResponse({
      headers: createHeaders(kind),
      stream: createUIStream(),
    });
    assert.deepEqual(
      uiResponse.headers.getSetCookie(),
      cookies,
      `createUIMessageStreamResponse must preserve both cookies for ${kind}`,
    );
    await uiResponse.text();
  }

  const server = createServer((request, response) => {
    if (request.url === '/native') {
      response.writeHead(200, {
        'content-type': 'text/plain',
        'set-cookie': cookies,
        'x-reproduction-control': controlHeader,
      });
      response.end('Native response.');
      return;
    }

    const [helper, kind] = request.url?.slice(1).split('-') ?? [];
    const headers =
      kind === 'headers' || kind === 'pairs' ? createHeaders(kind) : undefined;

    if (helper === 'text' && headers != null) {
      void pipeTextStreamToResponse({
        response,
        headers,
        textStream: createTextStream(),
      }).catch(error => response.destroy(error));
      return;
    }

    if (helper === 'ui' && headers != null) {
      void pipeUIMessageStreamToResponse({
        response,
        headers,
        stream: createUIStream(),
      }).catch(error => response.destroy(error));
      return;
    }

    response.writeHead(404).end();
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  assert.ok(address != null && typeof address === 'object');

  const failures: string[] = [];
  try {
    for (const path of [
      '/native',
      '/text-headers',
      '/text-pairs',
      '/ui-headers',
      '/ui-pairs',
    ]) {
      const fetchedResponse: Response = await fetch(
        `http://127.0.0.1:${address.port}${path}`,
      );
      const body = await fetchedResponse.text();
      const receivedCookies = fetchedResponse.headers.getSetCookie();

      assert.equal(fetchedResponse.status, 200);
      assert.equal(
        fetchedResponse.headers.get('x-reproduction-control'),
        controlHeader,
        `${path} must preserve an unrelated header`,
      );
      assert.match(
        body,
        path.startsWith('/ui')
          ? /Synthetic UI text/
          : /response|Synthetic text/,
        `${path} must preserve the response body`,
      );

      console.log(path, receivedCookies);
      if (path === '/native') {
        assert.deepEqual(
          receivedCookies,
          cookies,
          'native Node responses must preserve both cookies',
        );
      } else if (
        receivedCookies.length !== cookies.length ||
        receivedCookies.some((cookie, index) => cookie !== cookies[index])
      ) {
        failures.push(`${path}: ${JSON.stringify(receivedCookies)}`);
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  if (failures.length > 0) {
    throw new Error(
      `ISSUE_21058_REPRODUCED: Node pipe helpers dropped repeated Set-Cookie headers\n${failures.join('\n')}`,
    );
  }

  console.log('All Node pipe helpers preserved both Set-Cookie headers.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

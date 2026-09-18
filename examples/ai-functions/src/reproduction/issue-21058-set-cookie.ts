import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  createTextStreamResponse,
  createUIMessageStreamResponse,
  pipeTextStreamToResponse,
  pipeUIMessageStreamToResponse,
  type UIMessageChunk,
} from 'ai';

const cookies = [
  'theme=light; Expires=Wed, 21 Oct 2030 07:28:00 GMT; Path=/',
  'locale=en; Path=/',
];

const expectedTextBody = 'Synthetic text.';
const unrelatedHeader = ['x-reproduction-header', 'preserved'] as const;

function createHeaders(kind: 'headers' | 'array'): HeadersInit {
  if (kind === 'array') {
    return [
      ['set-cookie', cookies[0]],
      ['set-cookie', cookies[1]],
      [...unrelatedHeader],
    ];
  }

  const headers = new Headers([[unrelatedHeader[0], unrelatedHeader[1]]]);
  for (const cookie of cookies) {
    headers.append('set-cookie', cookie);
  }
  return headers;
}

function createTextStream() {
  return new ReadableStream<string>({
    start(controller) {
      controller.enqueue(expectedTextBody);
      controller.close();
    },
  });
}

function createUIStream() {
  return new ReadableStream<UIMessageChunk>({
    start(controller) {
      controller.enqueue({ type: 'start', messageId: 'synthetic-message' });
      controller.enqueue({ type: 'finish' });
      controller.close();
    },
  });
}

function assertEqual<T>(actual: T, expected: T, description: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${description}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`,
    );
  }
}

async function verifyWebResponseControls() {
  for (const headersKind of ['headers', 'array'] as const) {
    const textResponse = createTextStreamResponse({
      headers: createHeaders(headersKind),
      stream: createTextStream(),
    });
    assertEqual(
      textResponse.headers.getSetCookie(),
      cookies,
      `createTextStreamResponse cookies with ${headersKind} input`,
    );
    assertEqual(
      textResponse.headers.get(unrelatedHeader[0]),
      unrelatedHeader[1],
      `createTextStreamResponse unrelated header with ${headersKind} input`,
    );
    assertEqual(
      await textResponse.text(),
      expectedTextBody,
      `createTextStreamResponse body with ${headersKind} input`,
    );

    const uiResponse = createUIMessageStreamResponse({
      headers: createHeaders(headersKind),
      stream: createUIStream(),
    });
    assertEqual(
      uiResponse.headers.getSetCookie(),
      cookies,
      `createUIMessageStreamResponse cookies with ${headersKind} input`,
    );
    assertEqual(
      uiResponse.headers.get(unrelatedHeader[0]),
      unrelatedHeader[1],
      `createUIMessageStreamResponse unrelated header with ${headersKind} input`,
    );
    const uiBody = await uiResponse.text();
    if (!uiBody.includes('data: [DONE]')) {
      throw new Error(
        `createUIMessageStreamResponse body with ${headersKind} input did not finish`,
      );
    }
  }
}

async function main() {
  await verifyWebResponseControls();

  const server = createServer((request, response) => {
    if (request.url === '/native') {
      response.writeHead(200, {
        'content-type': 'text/plain',
        'set-cookie': cookies,
        [unrelatedHeader[0]]: unrelatedHeader[1],
      });
      response.end(expectedTextBody);
      return;
    }

    const headersKind = request.url?.endsWith('/array') ? 'array' : 'headers';
    const headers = createHeaders(headersKind);

    if (request.url?.startsWith('/ui/')) {
      void pipeUIMessageStreamToResponse({
        response,
        headers,
        stream: createUIStream(),
      }).catch(error => response.destroy(error));
      return;
    }

    void pipeTextStreamToResponse({
      response,
      headers,
      stream: createTextStream(),
    }).catch(error => response.destroy(error));
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const failures: string[] = [];
  try {
    const { port } = server.address() as AddressInfo;
    const nativeResponse = await fetch(`http://127.0.0.1:${port}/native`);
    assertEqual(
      nativeResponse.headers.getSetCookie(),
      cookies,
      'native Node response cookies',
    );
    assertEqual(
      nativeResponse.headers.get(unrelatedHeader[0]),
      unrelatedHeader[1],
      'native Node response unrelated header',
    );
    assertEqual(
      await nativeResponse.text(),
      expectedTextBody,
      'native Node response body',
    );

    for (const helper of ['text', 'ui'] as const) {
      for (const headersKind of ['headers', 'array'] as const) {
        const path = `/${helper}/${headersKind}`;
        const result = await fetch(`http://127.0.0.1:${port}${path}`);
        const body = await result.text();

        assertEqual(
          result.headers.get(unrelatedHeader[0]),
          unrelatedHeader[1],
          `${path} unrelated header`,
        );
        if (helper === 'text') {
          assertEqual(body, expectedTextBody, `${path} body`);
        } else if (!body.includes('data: [DONE]')) {
          throw new Error(`${path} body did not finish`);
        }

        const actualCookies = result.headers.getSetCookie();
        if (JSON.stringify(actualCookies) !== JSON.stringify(cookies)) {
          failures.push(
            `${path}: expected ${JSON.stringify(cookies)}, received ${JSON.stringify(actualCookies)}`,
          );
        }
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
    console.error(
      'ISSUE_21058_REPRODUCED: Node pipe helpers dropped Set-Cookie headers',
    );
    for (const failure of failures) {
      console.error(failure);
    }
    process.exitCode = 1;
    return;
  }

  console.log(
    'ISSUE_21058_NOT_REPRODUCED: all Node pipe helpers preserved Set-Cookie headers',
  );
}

main().catch(error => {
  console.error('ISSUE_21058_SETUP_FAILURE', error);
  process.exitCode = 2;
});

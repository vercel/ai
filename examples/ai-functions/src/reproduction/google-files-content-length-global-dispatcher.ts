import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createRequire } from 'node:module';
import type { Agent, Dispatcher } from 'undici';

const require = createRequire(import.meta.url);
const undici = require(
  fileURLToPath(
    new URL(
      '../../../../node_modules/.pnpm/undici@7.28.0/node_modules/undici/index.js',
      import.meta.url,
    ),
  ),
) as {
  Agent: new () => Agent;
  setGlobalDispatcher(dispatcher: Dispatcher): void;
};

function errorChain(error: unknown): string[] {
  const messages: string[] = [];
  let current = error;

  while (current instanceof Error) {
    messages.push(`${current.name}: ${current.message}`);
    current = current.cause;
  }

  return messages;
}

async function main() {
  let uploadBytesReceived = 0;
  let uploadRequestReceived = false;
  let uploadUrl = '';

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk));
    request.on('end', () => {
      if (request.url === '/upload/v1beta/files') {
        response.writeHead(200, { 'x-goog-upload-url': uploadUrl });
        response.end();
        return;
      }

      if (request.url === '/resume') {
        uploadRequestReceived = true;
        uploadBytesReceived = Buffer.concat(chunks).length;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            file: {
              name: 'files/issue-17049',
              displayName: 'issue-17049',
              mimeType: 'application/octet-stream',
              sizeBytes: String(uploadBytesReceived),
              uri: 'https://example.test/files/issue-17049',
              state: 'ACTIVE',
            },
          }),
        );
        return;
      }

      response.writeHead(404);
      response.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('Failed to determine the reproduction server address.');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  uploadUrl = `${baseUrl}/resume`;

  const agent = new undici.Agent();
  undici.setGlobalDispatcher(agent);

  try {
    const google = createGoogleGenerativeAI({
      apiKey: 'reproduction-api-key',
      baseURL: `${baseUrl}/v1beta`,
    });

    await google.files().uploadFile({
      data: { type: 'data', data: new Uint8Array([1, 2, 3]) },
      mediaType: 'application/octet-stream',
    });

    if (!uploadRequestReceived || uploadBytesReceived !== 3) {
      throw new Error(
        `Upload completed without sending the expected bytes: received=${uploadBytesReceived}.`,
      );
    }

    console.log(
      'Issue #17049 did not reproduce: google.files().uploadFile() uploaded 3 bytes.',
    );
  } catch (error) {
    const chain = errorChain(error);
    if (
      chain.includes('TypeError: fetch failed') &&
      chain.includes('InvalidArgumentError: invalid content-length header')
    ) {
      console.error(
        'ISSUE #17049 REPRODUCED: google.files().uploadFile() failed before sending upload bytes: TypeError: fetch failed (cause: InvalidArgumentError: invalid content-length header)',
      );
      process.exitCode = 1;
      return;
    }

    throw error;
  } finally {
    await agent.close();
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error != null) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

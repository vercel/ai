import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  createSecureServer,
  type IncomingHttpHeaders,
  type OutgoingHttpHeaders,
  type ServerHttp2Stream,
} from 'node:http2';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { streamText } from 'ai';

const connectionSpecificHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
]);
const bedrock = createAmazonBedrock({ region: 'us-east-1' });

function isChatRequest(headers: IncomingHttpHeaders): boolean {
  return headers[':path'] === '/chat';
}

async function pipeResponseToHttp2Stream({
  response,
  stream,
}: {
  response: Response;
  stream: ServerHttp2Stream;
}): Promise<string[]> {
  const headers: OutgoingHttpHeaders = {
    ':status': response.status,
  };
  const removedHeaders: string[] = [];

  response.headers.forEach((value, name) => {
    if (connectionSpecificHeaders.has(name)) {
      removedHeaders.push(name);
    } else {
      headers[name] = value;
    }
  });

  stream.respond(headers);

  if (response.body == null) {
    stream.end();
    return removedHeaders;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    stream.write(value);
  }
  stream.end();

  return removedHeaders;
}

function reconstructText(sse: string): string {
  let text = '';

  for (const block of sse.split('\n\n')) {
    const data = block
      .split('\n')
      .find(line => line.startsWith('data: '))
      ?.slice('data: '.length);

    if (data == null || data === '[DONE]') {
      continue;
    }

    const chunk = JSON.parse(data) as {
      type?: string;
      delta?: string;
    };

    if (chunk.type === 'text-delta') {
      text += chunk.delta ?? '';
    }
  }

  return text;
}

async function main() {
  const certificateDirectory = await mkdtemp(
    join(tmpdir(), 'ai-sdk-issue-10830-'),
  );
  const keyPath = join(certificateDirectory, 'key.pem');
  const certificatePath = join(certificateDirectory, 'certificate.pem');

  const openssl = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=DNS:localhost,IP:127.0.0.1',
      '-days',
      '1',
    ],
    { encoding: 'utf8' },
  );

  if (openssl.status !== 0) {
    throw new Error(`Could not create test certificate: ${openssl.stderr}`);
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  let server: ReturnType<typeof createSecureServer> | undefined;

  try {
    let sourceHeaders: Record<string, string> | undefined;
    let removedHeaders: string[] | undefined;
    let providerTextPromise: PromiseLike<string> | undefined;
    let serverError: unknown;

    server = createSecureServer({
      allowHTTP1: false,
      cert: await readFile(certificatePath),
      key: await readFile(keyPath),
    });

    server.on('stream', (http2Stream, headers) => {
      void (async () => {
        if (!isChatRequest(headers)) {
          http2Stream.respond({
            ':status': 200,
            'content-type': 'text/html; charset=utf-8',
          });
          http2Stream.end('<!doctype html><title>Issue 10830</title>');
          return;
        }

        const result = streamText({
          model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
          prompt: 'Reply with exactly ISSUE_10830_HTTP2_OK and no other text.',
        });
        const response = result.toUIMessageStreamResponse();

        sourceHeaders = {};
        response.headers.forEach((value, name) => {
          sourceHeaders![name] = value;
        });
        providerTextPromise = result.text;
        removedHeaders = await pipeResponseToHttp2Stream({
          response,
          stream: http2Stream,
        });
      })().catch(error => {
        serverError = error;
        if (!http2Stream.destroyed) {
          http2Stream.destroy(error as Error);
        }
      });
    });

    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(0, '127.0.0.1', resolve);
    });

    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('HTTP/2 server did not expose a TCP address.');
    }
    const origin = `https://127.0.0.1:${address.port}`;

    browser = await chromium.launch({
      headless: true,
      args: ['--ignore-certificate-errors', '--no-proxy-server'],
    });
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');

    const requestUrls = new Map<string, string>();
    const chatProtocols: string[] = [];
    const chatLoadingFailures: string[] = [];
    const chatRequestFailures: string[] = [];

    cdp.on(
      'Network.requestWillBeSent',
      (event: { requestId: string; request: { url: string } }) => {
        requestUrls.set(event.requestId, event.request.url);
      },
    );
    cdp.on(
      'Network.responseReceived',
      (event: {
        requestId: string;
        response: { protocol?: string; url: string };
      }) => {
        if (new URL(event.response.url).pathname === '/chat') {
          chatProtocols.push(event.response.protocol ?? 'missing');
        }
      },
    );
    cdp.on(
      'Network.loadingFailed',
      (event: { errorText: string; requestId: string }) => {
        const url = requestUrls.get(event.requestId);
        if (url != null && new URL(url).pathname === '/chat') {
          chatLoadingFailures.push(event.errorText);
        }
      },
    );
    page.on('requestfailed', request => {
      if (new URL(request.url()).pathname === '/chat') {
        chatRequestFailures.push(
          request.failure()?.errorText ?? 'unknown request failure',
        );
      }
    });

    await page.goto(origin, { waitUntil: 'domcontentloaded' });

    let browserResult: { body: string; status: number };
    try {
      browserResult = await page.evaluate(async () => {
        const response = await fetch('/chat', { method: 'POST' });
        return {
          body: await response.text(),
          status: response.status,
        };
      });
    } catch (error) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const browserFailures = [
        ...chatRequestFailures,
        ...chatLoadingFailures,
      ].join(', ');
      throw new Error(
        `ISSUE 10830 REPRODUCED: Chromium failed the HTTP/2 /chat stream: ${
          browserFailures || String(error)
        }`,
      );
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    if (serverError != null) {
      throw serverError;
    }
    if (providerTextPromise == null) {
      throw new Error('The /chat handler did not start the provider stream.');
    }

    const providerText = await providerTextPromise;
    const browserText = reconstructText(browserResult.body);
    const receivedDone = browserResult.body.includes('data: [DONE]\n\n');
    const failures = [...chatRequestFailures, ...chatLoadingFailures];

    console.log(`HTTP/2 protocol: ${chatProtocols.join(', ') || 'missing'}`);
    console.log(`/chat status: ${browserResult.status}`);
    console.log(
      `AI SDK Connection header: ${sourceHeaders?.connection ?? 'missing'}`,
    );
    console.log(
      `HTTP/2 adapter removed: ${removedHeaders?.join(', ') || 'none'}`,
    );
    console.log(`Provider text: ${JSON.stringify(providerText)}`);
    console.log(`Browser text: ${JSON.stringify(browserText)}`);
    console.log(`Terminal [DONE]: ${receivedDone}`);
    console.log(`Failed /chat requests: ${failures.length}`);

    if (
      !chatProtocols.includes('h2') ||
      browserResult.status !== 200 ||
      browserText !== providerText ||
      !receivedDone ||
      failures.length > 0
    ) {
      throw new Error(
        `ISSUE 10830 REPRODUCED: Chromium failed the completed HTTP/2 /chat stream: ${failures.join(
          ', ',
        )}`,
      );
    }

    console.log('RESULT: ISSUE_NOT_REPRODUCED');
  } finally {
    await browser?.close();
    if (server != null) {
      await new Promise<void>(resolve => server!.close(() => resolve()));
    }
    await rm(certificateDirectory, { force: true, recursive: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

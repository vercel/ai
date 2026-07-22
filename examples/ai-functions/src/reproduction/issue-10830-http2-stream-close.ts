import { createSecureServer } from 'node:http2';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import {
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from 'ai';
import { chromium } from 'playwright';

const key = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCfX34tfIYBdy2q
UYJfbthbQqTT6Vi7ReAOe4niH8jwD+ODE5R66x4Ff2wCZnr3t3HQHWUaas0Zeay6
Kk9FZFNfY6MrMVQbUKZCdemhp3XM3IyhToDhHO1gVQnlL8+l4gFwptWuWgpQsyam
qcAenMuG0bGL7ahJMKr4+7jksQc82PAFFfKLXZIR7GS8UwOSrpzfD8FXTr/+by5k
uF2iA7+Sy8a9tU39NXtAUmsP0BCdD9IFRC6M+8rexo978CWyy9Zk4QcrafViRgOe
zClDL2vDb4qj3AqE+wcAW0TLvacMKalgH+blB+ah//qPgcB7wixqOowlWbeziIpk
eagzjUbPAgMBAAECggEACkW9PBdTpKwjqflSl7rtGezD82v0YS9ez4nDWGtHqCZa
05I86gAi0XEZUb183ZMNNFnaSdQ3RhYWpD7UsmdS2TCMThA1S9FsXGPkD2ko0Alc
zL58bIYdzGDCBri7/9HMDMPKibaaBZuWhfvyoZNMdwzBdRoR1JRDeoSKS75+KSJd
+onPlaSVRYk5hgAkpgt49dW/M6ZJxeFlK5AsoYEz1/ZIy4fWJNeBG4wAm0hFr1mL
FYzu8zFTZh48hSyO0usw/whFsICuP8rq7wXzBUcaMPQJGVbkW4JCc/U16RjYJTyD
tzeSN8qbnWf+ht+mWCwbVexfe0DYns4sUUs1lio7mQKBgQDbQ/xAdY7fMv84jc3L
30HlPem34YYVlZJ/kMILzlbaVBWEQBjv0g8CcwPDFdCMZO4PVkdKggn1eappQGTt
0kH0b6Rjjh7PuB4ajn4q4p3kWnq/roDLuP52vjo3JE9NIrEGKaob/gLaSp3yq0VA
5hEu62mQs4Tly/6DzR/NrdGTCwKBgQC6EstKuq+5OheRJSWnzi4BO0rYWPSdHXxY
U1RHeJY1cwqGZtWPhOBeglvSbhW2G0JA/K4Zvd1sRR8Xo4KKPoub4xmp6BRmr/zp
LSWRlKrq4XU+gYg7MmrERFTKzVv5SAhnQY6vroYbvu3Se+EI8lOIlwn2Bm9LAsAZ
v/jAE6P1zQKBgFG0aroGVF/dm/cR+D7hCagHwyCvHAzM+JMqePR3RiwDKyVl0SUE
bG1oOF2oslaugXsblmMwQ8/CL3sa8MEiGUuhkms6mUakACu7L06BtX5TLOxidUH0
xHWw+vZzRE2lALwgKHBX3e5D4cl8gsjlMj/+nw65pmsO8d9hP1mgTLjzAoGAIjzx
ETgWu3N4AKogKqdiibF6TSLZJ8vUJIB4wonqwb0AU8i6RSVDD8DW2nqNHiwX3dNg
ybXI93IkjXn1vDBUCgQYpc3hax+43sMC5a3AYWXI6A53ncTiJmkYXRS6dr0NZsqG
UcdAP/y6z/8hYj8MpdZ867s1YU0JQfOz9svmYIUCgYAdm/P//8x0eiMwjxIX7/ak
davVawQamqnGvM/w6t0fM5DPGkNoFlB8TTCg4/dfFfA4EMxMQyTv0/THZF6GcVXN
pXcWdtsMiXVpAOn/dhzJpbmuTdNsRHU8T9imZhmWX+gWFh4ECQ/PHF/ZHN2m0AfL
Dk6ZgGP6InkvWJlsj83PEw==
-----END PRIVATE KEY-----`;

const cert = `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUYG6KEQUmkzeSWdmBpP9M0cV2bQwwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDcyMjEzMzMwOVoXDTM2MDcx
OTEzMzMwOVowFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAn19+LXyGAXctqlGCX27YW0Kk0+lYu0XgDnuJ4h/I8A/j
gxOUeuseBX9sAmZ697dx0B1lGmrNGXmsuipPRWRTX2OjKzFUG1CmQnXpoad1zNyM
oU6A4RztYFUJ5S/PpeIBcKbVrloKULMmpqnAHpzLhtGxi+2oSTCq+Pu45LEHPNjw
BRXyi12SEexkvFMDkq6c3w/BV06//m8uZLhdogO/ksvGvbVN/TV7QFJrD9AQnQ/S
BUQujPvK3saPe/AlssvWZOEHK2n1YkYDnswpQy9rw2+Ko9wKhPsHAFtEy72nDCmp
YB/m5Qfmof/6j4HAe8IsajqMJVm3s4iKZHmoM41GzwIDAQABo28wbTAdBgNVHQ4E
FgQUpz7v5cLNaPFZ0oUp86PSqubT040wHwYDVR0jBBgwFoAUpz7v5cLNaPFZ0oUp
86PSqubT040wDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAIVrBSfWMvAlOPs5AjQIzQW72Fy8bYgy
FsHEilO7q7aOAkQfHQUqKXKI0p0OxCXohhw8DlOGYHiYF3I96RsKS4NsdZ7I2xAZ
6wqd+UEdYKX2LMhpPqGv7pE5b/y10/JKVsz7IsKdagCd9bo3OpgJc7e/xE1CP0sT
jnvBLd6OLhKDC80kqVc1XOYlSJPQjKjq4a3dkF9ThDZTeLwRq0mHr7LqY8vTHCf6
Kqknty4sdHcAMmbTe31IWpRlSqPtZxaFmMx9Hq9e8CUQP49zj6Juc17k94aE9iWK
kwRBf5C3RutIFO0Xk842d2qX1cg9AfzwowyAvS45T8Q53VZIKstkyJQ=
-----END CERTIFICATE-----`;

const connectionSpecificHeaders = new Set([
  'connection',
  'keep-alive',
  'proxy-connection',
  'transfer-encoding',
  'upgrade',
]);

function extractStreamedText(body: string | null): string {
  if (body == null) {
    return '';
  }

  let text = '';
  for (const event of body.split('\n\n')) {
    if (!event.startsWith('data: {')) {
      continue;
    }

    const chunk = JSON.parse(event.slice('data: '.length)) as {
      type?: unknown;
      delta?: unknown;
    };
    if (chunk.type === 'text-delta' && typeof chunk.delta === 'string') {
      text += chunk.delta;
    }
  }
  return text;
}

async function main() {
  let generatedConnectionHeader: string | null = null;
  let providerCompletion:
    | Promise<{ finishReason: string; text: string }>
    | undefined;
  const bedrock = createAmazonBedrock({ region: 'us-east-1' });

  const server = createSecureServer({ key, cert });
  server.on('stream', async (stream, requestHeaders) => {
    if (requestHeaders[':path'] === '/') {
      stream.respond({
        ':status': 200,
        'content-type': 'text/html; charset=utf-8',
      });
      stream.end('<!doctype html><title>issue 10830</title>');
      return;
    }

    if (requestHeaders[':path'] !== '/chat') {
      stream.respond({ ':status': 404 });
      stream.end();
      return;
    }

    const result = streamText({
      model: bedrock('anthropic.claude-3-haiku-20240307-v1:0'),
      prompt: 'Reply with the exact text: hello over HTTP/2',
      maxOutputTokens: 30,
    });
    providerCompletion = Promise.all([result.finishReason, result.text]).then(
      ([finishReason, text]) => ({ finishReason, text }),
    );

    const response = createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });

    generatedConnectionHeader = response.headers.get('connection');

    const responseHeaders: Record<string, string | number> = {
      ':status': response.status,
    };
    response.headers.forEach((value, name) => {
      // RFC 9113 requires an HTTP/2 transport to remove HTTP/1.x
      // connection-specific fields while adapting a protocol-neutral Response.
      if (!connectionSpecificHeaders.has(name)) {
        responseHeaders[name] = value;
      }
    });

    stream.respond(responseHeaders);
    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        stream.end();
        break;
      }
      stream.write(value);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address == null || typeof address === 'string') {
    throw new Error('HTTP/2 server did not expose a TCP port');
  }

  const origin = `https://127.0.0.1:${address.port}`;
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  const failedRequests: string[] = [];
  page.on('requestfailed', request => {
    failedRequests.push(
      `${request.url()}: ${request.failure()?.errorText ?? 'unknown failure'}`,
    );
  });

  try {
    await page.goto(origin);
    const result = await page.evaluate(async () => {
      try {
        const response = await fetch('/chat');
        return {
          body: await response.text(),
          error: null,
          status: response.status,
        };
      } catch (error) {
        return {
          body: null,
          error: error instanceof Error ? error.message : String(error),
          status: null,
        };
      }
    });
    const protocol = await page.evaluate(() => {
      const entries = performance.getEntriesByName(
        new URL('/chat', location.href).href,
      );
      return (entries.at(-1) as PerformanceResourceTiming | undefined)
        ?.nextHopProtocol;
    });
    if (providerCompletion == null) {
      throw new Error('The /chat route did not start the Bedrock request');
    }
    const providerResult = await providerCompletion;
    const streamedText = extractStreamedText(result.body);

    const chatFailures = failedRequests.filter(failure =>
      failure.includes('/chat'),
    );
    const completed =
      protocol === 'h2' &&
      result.status === 200 &&
      result.error === null &&
      providerResult.text.length > 0 &&
      streamedText === providerResult.text &&
      result.body.endsWith('data: [DONE]\n\n') &&
      chatFailures.length === 0;

    console.log(
      JSON.stringify(
        {
          chatFailures,
          generatedConnectionHeader,
          protocol,
          providerResult,
          result,
          streamedText,
        },
        null,
        2,
      ),
    );

    if (!completed) {
      throw new Error(
        'ISSUE_10830_REPRODUCED: HTTP/2 /chat stream did not close cleanly',
      );
    }

    console.log(
      'ISSUE_10830_NOT_REPRODUCED: HTTP/2 /chat stream completed cleanly with status 200 and the terminal [DONE] event',
    );
  } finally {
    await browser.close();
    const closeError = await new Promise<Error | undefined>(resolve => {
      server.close(resolve);
    });
    if (closeError != null) {
      throw closeError;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

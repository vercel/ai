import { createCohere } from '@ai-sdk/cohere';
import { generateText, streamText, type LanguageModelUsage } from 'ai';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

const providerUsage = {
  tokens: {
    input_tokens: 500,
    output_tokens: 5,
  },
  cached_tokens: 448,
};

const expectedInputTokenDetails = {
  noCacheTokens: 52,
  cacheReadTokens: 448,
};

function hasExpectedCachedTokenUsage(usage: LanguageModelUsage) {
  return (
    usage.inputTokenDetails.noCacheTokens ===
      expectedInputTokenDetails.noCacheTokens &&
    usage.inputTokenDetails.cacheReadTokens ===
      expectedInputTokenDetails.cacheReadTokens
  );
}

async function main() {
  const server = createServer((request, response) => {
    let body = '';

    request.setEncoding('utf8');
    request.on('data', chunk => {
      body += chunk;
    });
    request.on('end', () => {
      const { stream } = JSON.parse(body) as { stream?: boolean };

      if (!stream) {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({
            id: 'message-1',
            finish_reason: 'COMPLETE',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Hello' }],
            },
            usage: providerUsage,
          }),
        );
        return;
      }

      response.writeHead(200, { 'content-type': 'text/event-stream' });

      const writeEvent = (type: string, data: Record<string, unknown>) => {
        response.write(
          `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`,
        );
      };

      writeEvent('message-start', {
        id: 'message-1',
        delta: {
          message: { role: 'assistant', content: [] },
        },
      });
      writeEvent('content-start', {
        index: 0,
        delta: {
          message: {
            content: { type: 'text', text: '' },
          },
        },
      });
      writeEvent('content-delta', {
        index: 0,
        delta: {
          message: {
            content: { text: 'Hello' },
          },
        },
      });
      writeEvent('content-end', { index: 0 });
      writeEvent('message-end', {
        delta: {
          finish_reason: 'COMPLETE',
          usage: providerUsage,
        },
      });
      response.end();
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  try {
    const { port } = server.address() as AddressInfo;
    const model = createCohere({
      apiKey: 'test',
      baseURL: `http://127.0.0.1:${port}/v2`,
    })('command-a-03-2025');

    const generateUsage = (
      await generateText({
        model,
        prompt: 'hi',
      })
    ).usage;

    const streamResult = streamText({
      model,
      prompt: 'hi',
    });
    await streamResult.consumeStream();
    const streamUsage = await streamResult.usage;

    if (
      !hasExpectedCachedTokenUsage(generateUsage) ||
      !hasExpectedCachedTokenUsage(streamUsage)
    ) {
      throw new Error(
        'ISSUE_22070_REPRODUCED: Cohere cached_tokens is missing from inputTokenDetails. ' +
          `generateText=${JSON.stringify(generateUsage.inputTokenDetails)} ` +
          `streamText=${JSON.stringify(streamUsage.inputTokenDetails)}`,
      );
    }

    console.log(
      'Cohere cached_tokens is mapped for both generateText and streamText.',
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
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

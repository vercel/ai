import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { readFile } from 'node:fs/promises';

const fixtureUrl = new URL(
  '../../../../packages/amazon-bedrock/src/__fixtures__/model-stream-error-exception.eventstream.base64.txt',
  import.meta.url,
);

async function main() {
  const responseBytes = Buffer.from(
    (await readFile(fixtureUrl, 'utf8')).trim(),
    'base64',
  );

  const bedrock = createAmazonBedrock({
    apiKey: 'test-api-key',
    region: 'us-east-1',
    fetch: async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(responseBytes);
            controller.close();
          },
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/vnd.amazon.eventstream',
          },
        },
      ),
  });

  const { stream } = await bedrock(
    'anthropic.claude-3-haiku-20240307-v1:0',
  ).doStream({
    prompt: [
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
    ],
    includeRawChunks: false,
  });

  const parts = [];
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    parts.push(value);
  }

  const validEventWasPreserved = parts.some(
    part => part.type === 'text-delta' && part.delta === 'before error',
  );
  if (!validEventWasPreserved) {
    throw new Error(
      'Valid Bedrock event-stream contentBlockDelta was not preserved.',
    );
  }

  const hasModeledError = parts.some(
    part =>
      part.type === 'error' &&
      typeof part.error === 'object' &&
      part.error != null &&
      'message' in part.error &&
      part.error.message === 'Model Stream Error',
  );
  const hasErrorFinish = parts.some(
    part => part.type === 'finish' && part.finishReason === 'error',
  );

  if (!hasModeledError || !hasErrorFinish) {
    console.error(
      'ISSUE #19034 REPRODUCED: modeled Bedrock event-stream exception was dropped instead of emitting an error part and finishReason "error".',
    );
    console.error(JSON.stringify(parts, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    'Modeled Bedrock event-stream exception emitted an error part and finishReason "error".',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

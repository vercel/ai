import {
  createJsonLinesResponseHandler,
  DownloadError,
} from '@ai-sdk/provider-utils';
import assert from 'node:assert/strict';
import { z } from 'zod';

async function main() {
  const chunk = new Uint8Array(1024 * 1024).fill(65);
  let chunksSent = 0;
  let cancelled = false;

  const endlessStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(chunk);
      chunksSent++;
    },
    cancel() {
      cancelled = true;
    },
  });

  const handler = createJsonLinesResponseHandler(z.unknown());
  const { value: lines } = await handler({
    url: 'http://example.com/endless.jsonl',
    requestBodyValues: {},
    response: new Response(endlessStream),
  });

  let caughtError: unknown;
  try {
    for await (const line of lines) {
      assert.fail(`Unexpected parsed line: ${JSON.stringify(line)}`);
    }
  } catch (error) {
    caughtError = error;
  }

  assert.ok(
    DownloadError.isInstance(caughtError),
    `Expected a catchable DownloadError, received ${String(caughtError)}`,
  );
  assert.equal(
    caughtError.message,
    'JSON Lines response exceeded maximum line size of 67108864 bytes.',
  );
  assert.equal(cancelled, true, 'Expected the source stream to be cancelled');
  assert.ok(
    chunksSent <= 66,
    `Expected bounded consumption, but ${chunksSent} MiB chunks were requested`,
  );

  console.log(
    `PASS: caught ${caughtError.name} after ${chunksSent} MiB without a newline`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

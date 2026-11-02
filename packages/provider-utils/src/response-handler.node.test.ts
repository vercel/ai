import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// Two 24 MiB images in one JSON body: 64 MiB of base64 text. Reading that body
// into text and parsing it needs more than 64 MiB of V8 heap (the text, and
// the strings that `JSON.parse` creates), so the default pipeline cannot run
// within the 48 MiB heap that is allowed here. With `experimental_binaryFields`
// the heap only holds the short skeleton: the decoded bytes live in off-heap
// array buffers.
const imageMiB = 24;
const imageCount = 2;
const maxOldSpaceMiB = 48;

// The first part of the child process: it generates the body lazily (it must
// not hold it either) as the stream `body`, of `count` images.
const bodyScript = (distUrl: string, count: number) => `
  import { createJsonResponseHandler, jsonSchema } from ${JSON.stringify(distUrl)};

  const imageBytes = ${imageMiB} * 1024 * 1024;
  const imageCount = ${count};
  const pieceBytes = 48 * 1024;

  function piece(imageIndex, pieceIndex, length) {
    const bytes = new Uint8Array(length);
    let state = ((imageIndex + 1) * 2654435761 + pieceIndex * 40503) >>> 0 || 1;
    for (let index = 0; index < length; index++) {
      state ^= state << 13;
      state >>>= 0;
      state ^= state >>> 17;
      state ^= state << 5;
      state >>>= 0;
      bytes[index] = state & 0xff;
    }
    return bytes;
  }

  const encoder = new TextEncoder();

  let image = 0;
  let pieceIndex = 0;
  let phase = 'open';
  const body = new ReadableStream(
    {
      pull(controller) {
        if (phase === 'open') {
          controller.enqueue(encoder.encode('{"images":["'));
          phase = 'data';
        } else if (phase === 'data') {
          const length = Math.min(pieceBytes, imageBytes - pieceIndex * pieceBytes);
          const base64 = Buffer.from(piece(image, pieceIndex, length)).toString('base64');
          controller.enqueue(encoder.encode(base64));
          pieceIndex += 1;
          if (pieceIndex * pieceBytes >= imageBytes) {
            pieceIndex = 0;
            image += 1;
            phase = image === imageCount ? 'close' : 'next';
          }
        } else if (phase === 'next') {
          controller.enqueue(encoder.encode('","'));
          phase = 'data';
        } else {
          controller.enqueue(encoder.encode('"]}'));
          controller.close();
        }
      },
    },
    { highWaterMark: 0 },
  );
`;

// Reads the body through the handler and compares the decoded bytes with the
// bytes that were generated.
const decodeScript = (distUrl: string) =>
  bodyScript(distUrl, imageCount) +
  `
  const handler = createJsonResponseHandler(
    jsonSchema({}, { validate: value => ({ success: true, value }) }),
    { experimental_binaryFields: ['images[*]'] },
  );
  const { value } = await handler({
    url: 'https://example.com',
    requestBodyValues: {},
    response: new Response(body),
  });

  let matches = value.images.length === imageCount;
  for (let imageIndex = 0; matches && imageIndex < imageCount; imageIndex++) {
    const decoded = value.images[imageIndex];
    matches = decoded instanceof Uint8Array && decoded.length === imageBytes;
    for (let at = 0; matches && at * pieceBytes < imageBytes; at++) {
      const expected = piece(imageIndex, at, Math.min(pieceBytes, imageBytes - at * pieceBytes));
      for (let index = 0; matches && index < expected.length; index++) {
        matches = decoded[at * pieceBytes + index] === expected[index];
      }
    }
  }

  process.stdout.write(matches ? 'decoded' : 'mismatch');
`;

// Reads the body of one image through the handler with a Standard Schema
// validator that rejects it. The validator is not Zod's: its error is made from
// the value it is given, and its issue carries the input it is about, like the
// issues of arktype do. Both hold the decoded bytes, which must not end up in
// the message: serialized byte by byte they are more than 300 MB of text.
const rejectScript = (distUrl: string) =>
  bodyScript(distUrl, 1) +
  `
  const schema = {
    '~standard': {
      version: 1,
      vendor: 'custom',
      validate: value => ({
        issues: [
          { message: 'images[0] must be a string', path: ['images', 0], data: value.images[0] },
        ],
      }),
    },
  };
  const handler = createJsonResponseHandler(schema, {
    experimental_binaryFields: ['images[*]'],
  });
  const error = await handler({
    url: 'https://example.com',
    requestBodyValues: {},
    response: new Response(body),
  }).then(
    () => undefined,
    error => error,
  );

  const message = error?.cause?.message ?? '';
  process.stdout.write(
    message.includes('images[0] must be a string') && message.length < 2000
      ? 'rejected'
      : 'unexpected: ' + message.slice(0, 200),
  );
`;

async function runChild(script: (distUrl: string) => string) {
  const distPath = resolve('dist/index.js');
  const builtSource = await readFile(distPath, 'utf8');
  // The child imports the build output: a stale build would test old code.
  expect(builtSource, 'dist is stale: run `pnpm build`').toContain(
    'experimental_binaryFields',
  );

  return execFileSync(
    process.execPath,
    [
      `--max-old-space-size=${maxOldSpaceMiB}`,
      '--input-type=module',
      '--eval',
      script(pathToFileURL(distPath).href),
    ],
    { encoding: 'utf8', timeout: 60_000 },
  );
}

describe('createJsonResponseHandler with experimental_binaryFields memory regression', () => {
  it(`decodes ${imageCount} x ${imageMiB} MiB images within a ${maxOldSpaceMiB} MiB heap`, async () => {
    expect(await runChild(decodeScript)).toBe('decoded');
  }, 60_000);

  it(`reports a Standard Schema validator that rejects a ${imageMiB} MiB image within a ${maxOldSpaceMiB} MiB heap`, async () => {
    expect(await runChild(rejectScript)).toBe('rejected');
  }, 60_000);
});

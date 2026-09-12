import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  convertToBase64,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

const byteLength = 14_078_689;
const heapLimitMiB = 128;
const scriptPath = fileURLToPath(import.meta.url);
const pdfHeader = new TextEncoder().encode('%PDF-1.7\n');

function createPdfBytes(): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  bytes.set(pdfHeader);

  for (let index = pdfHeader.length; index < bytes.length; index++) {
    bytes[index] = index % 251;
  }

  return bytes;
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function runChild(mode: 'native' | 'sdk', expectedDigest?: string) {
  return spawnSync(
    process.execPath,
    [
      `--max-old-space-size=${heapLimitMiB}`,
      '--import',
      'tsx',
      scriptPath,
      `--child=${mode}`,
      ...(expectedDigest == null
        ? []
        : [`--expected-digest=${expectedDigest}`]),
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
}

async function runNativeChild(): Promise<void> {
  const bytes = createPdfBytes();
  const encoded = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).toString('base64');

  assert.equal(
    convertToBase64(encoded),
    encoded,
    'pre-encoded base64 strings should pass through unchanged',
  );

  console.log(`NATIVE_DIGEST:${digest(encoded)}`);
}

async function runSdkChild(expectedDigest: string): Promise<void> {
  const encoded = convertUint8ArrayToBase64(createPdfBytes());

  assert.equal(
    encoded.length,
    4 * Math.ceil(byteLength / 3),
    'SDK encoding should produce the complete base64 output',
  );
  assert.equal(
    digest(encoded),
    expectedDigest,
    'SDK encoding should match native base64 output',
  );

  console.log('SDK_ENCODING_SUCCEEDED');
}

async function main(): Promise<void> {
  const childMode = process.argv
    .find(argument => argument.startsWith('--child='))
    ?.slice('--child='.length);

  if (childMode === 'native') {
    await runNativeChild();
    return;
  }

  if (childMode === 'sdk') {
    const expectedDigest = process.argv
      .find(argument => argument.startsWith('--expected-digest='))
      ?.slice('--expected-digest='.length);

    assert.ok(expectedDigest, 'native reference digest is required');
    await runSdkChild(expectedDigest);
    return;
  }

  const nativeResult = runChild('native');
  assert.equal(
    nativeResult.status,
    0,
    `native base64 reference failed:\n${nativeResult.stderr}`,
  );

  const expectedDigest = nativeResult.stdout.match(
    /NATIVE_DIGEST:([a-f0-9]{64})/,
  )?.[1];
  assert.ok(expectedDigest, 'native reference did not emit its digest');

  const sdkResult = runChild('sdk', expectedDigest);

  if (sdkResult.status === 0) {
    assert.match(sdkResult.stdout, /SDK_ENCODING_SUCCEEDED/);
    console.log(
      `SDK successfully encoded ${byteLength.toLocaleString('en-US')} PDF bytes within a ${heapLimitMiB} MiB V8 heap.`,
    );
    return;
  }

  const sdkFailureOutput = `${sdkResult.stdout}\n${sdkResult.stderr}`;
  const exhaustedHeap =
    /heap out of memory|Reached heap limit|Ineffective mark-compacts near heap limit/i.test(
      sdkFailureOutput,
    );

  if (!exhaustedHeap) {
    console.error('SDK child failed for a reason other than heap exhaustion.');
    console.error(sdkFailureOutput);
    process.exit(2);
  }

  console.error(
    `ISSUE_20149_REPRODUCED: ${byteLength.toLocaleString('en-US')}-byte SDK base64 encoding exhausted a ${heapLimitMiB} MiB V8 heap`,
  );
  process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(2);
});

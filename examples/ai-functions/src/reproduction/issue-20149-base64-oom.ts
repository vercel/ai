import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  convertToBase64,
  convertUint8ArrayToBase64,
} from '../../../../packages/provider-utils/src/uint8-utils';

const byteLength = 14_078_689;
const expectedBase64Length = 18_771_588;
const expectedBase64Sha256 =
  'f52b26786eee4addc3838e3bc3a203c92e4812bbf4967daac188b0d040e05add';
const heapLimitMb = 128;
const scriptPath = fileURLToPath(import.meta.url);

function createBytes() {
  const bytes = new Uint8Array(byteLength);

  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = index & 0xff;
  }

  return bytes;
}

function assertExpectedBase64(base64: string) {
  const sha256 = createHash('sha256').update(base64).digest('hex');

  if (
    base64.length !== expectedBase64Length ||
    sha256 !== expectedBase64Sha256
  ) {
    throw new Error(
      `unexpected base64 output: length=${base64.length}, sha256=${sha256}`,
    );
  }
}

async function runChild(mode: 'reference' | 'sdk') {
  const bytes = createBytes();

  if (mode === 'reference') {
    const base64 = Buffer.from(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).toString('base64');
    assertExpectedBase64(base64);

    if (convertToBase64(base64) !== base64) {
      throw new Error('pre-encoded base64 string was not passed through');
    }

    console.log('REFERENCE_ENCODING_SUCCEEDED');
    return;
  }

  const base64 = convertUint8ArrayToBase64(bytes);
  assertExpectedBase64(base64);
  console.log('SDK_ENCODING_SUCCEEDED');
}

function runWithHeapLimit(mode: 'reference' | 'sdk') {
  return spawnSync(
    process.execPath,
    [
      `--max-old-space-size=${heapLimitMb}`,
      '--import',
      'tsx',
      scriptPath,
      `--child=${mode}`,
    ],
    {
      encoding: 'utf8',
      timeout: 60_000,
    },
  );
}

function childOutput(result: ReturnType<typeof runWithHeapLimit>) {
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

async function main() {
  const childMode = process.argv
    .find(argument => argument.startsWith('--child='))
    ?.slice('--child='.length);

  if (childMode === 'reference' || childMode === 'sdk') {
    await runChild(childMode);
    return;
  }

  const reference = runWithHeapLimit('reference');
  if (
    reference.status !== 0 ||
    !childOutput(reference).includes('REFERENCE_ENCODING_SUCCEEDED')
  ) {
    throw new Error(
      `reference encoding did not succeed under ${heapLimitMb} MiB:\n${childOutput(reference)}`,
    );
  }

  const sdk = runWithHeapLimit('sdk');
  const sdkOutput = childOutput(sdk);

  if (sdk.status === 0 && sdkOutput.includes('SDK_ENCODING_SUCCEEDED')) {
    console.log(
      `AI SDK encoded ${byteLength} bytes correctly under ${heapLimitMb} MiB.`,
    );
    return;
  }

  if (sdkOutput.includes('JavaScript heap out of memory')) {
    console.error(
      `ISSUE_20149_REPRODUCED: AI SDK base64 encoding exhausted a ${heapLimitMb} MiB heap for ${byteLength} bytes while native encoding and string pass-through succeeded.`,
    );
    process.exitCode = 1;
    return;
  }

  throw new Error(`AI SDK encoding failed unexpectedly:\n${sdkOutput}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  convertToBase64,
  convertUint8ArrayToBase64,
} from '@ai-sdk/provider-utils';

const byteLength = 14_078_689;
const expectedBase64Length = 4 * Math.ceil(byteLength / 3);
const heapLimitMb = 128;

async function runChild(mode: 'native' | 'sdk' | 'workaround') {
  const scriptPath = fileURLToPath(import.meta.url);

  return new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [`--max-old-space-size=${heapLimitMb}`, '--import', 'tsx', scriptPath],
      {
        cwd: process.cwd(),
        env: { ...process.env, ISSUE_20149_MODE: mode },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk;
    });
    child.stderr.on('data', chunk => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => {
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function assertSuccessfulChild({
  label,
  result,
  expectedSignal,
}: {
  label: string;
  result: Awaited<ReturnType<typeof runChild>>;
  expectedSignal: string;
}) {
  if (result.code !== 0 || result.signal !== null) {
    throw new Error(
      `${label} failed unexpectedly (code=${result.code}, signal=${result.signal}): ${result.stderr}`,
    );
  }

  if (!result.stdout.includes(expectedSignal)) {
    throw new Error(`${label} did not validate its base64 output`);
  }
}

async function runParent() {
  const native = await runChild('native');
  assertSuccessfulChild({
    label: 'Native Buffer reference',
    result: native,
    expectedSignal: `NATIVE_OK ${expectedBase64Length}`,
  });

  const workaround = await runChild('workaround');
  assertSuccessfulChild({
    label: 'Pre-encoded string workaround',
    result: workaround,
    expectedSignal: `WORKAROUND_OK ${expectedBase64Length}`,
  });

  const sdk = await runChild('sdk');

  if (sdk.code === 0 && sdk.signal === null) {
    if (!sdk.stdout.includes(`SDK_OK ${expectedBase64Length}`)) {
      throw new Error('AI SDK encoder completed without validating its output');
    }

    console.log(
      `AI SDK encoder completed a ${byteLength}-byte input within a ${heapLimitMb} MiB heap`,
    );
    return;
  }

  const isHeapOutOfMemory =
    /heap out of memory|reached heap limit|allocation failed/i.test(sdk.stderr);

  if (!isHeapOutOfMemory) {
    throw new Error(
      `AI SDK encoder failed for an unrelated reason (code=${sdk.code}, signal=${sdk.signal}): ${sdk.stderr}`,
    );
  }

  console.error(
    `ISSUE 20149 REPRODUCED: AI SDK base64 encoding OOMed for ${byteLength} bytes while native Buffer and the pre-encoded string workaround succeeded within a ${heapLimitMb} MiB heap`,
  );
  process.exitCode = 1;
}

function encodeWithNativeBuffer() {
  const bytes = new Uint8Array(byteLength);
  const encoded = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).toString('base64');

  if (encoded.length !== expectedBase64Length) {
    throw new Error('Native Buffer produced an unexpected base64 length');
  }

  console.log(`NATIVE_OK ${encoded.length}`);
}

function encodeWithSdk() {
  const bytes = new Uint8Array(byteLength);
  const encoded = convertUint8ArrayToBase64(bytes);
  const expected = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).toString('base64');

  if (encoded !== expected) {
    throw new Error('AI SDK encoder produced incorrect base64 output');
  }

  console.log(`SDK_OK ${encoded.length}`);
}

function verifyPreEncodedStringWorkaround() {
  const bytes = new Uint8Array(byteLength);
  const encoded = Buffer.from(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).toString('base64');
  const converted = convertToBase64(encoded);

  if (converted !== encoded) {
    throw new Error('AI SDK changed pre-encoded base64 input');
  }

  console.log(`WORKAROUND_OK ${converted.length}`);
}

async function main() {
  switch (process.env.ISSUE_20149_MODE) {
    case 'native':
      encodeWithNativeBuffer();
      break;
    case 'sdk':
      encodeWithSdk();
      break;
    case 'workaround':
      verifyPreEncodedStringWorkaround();
      break;
    default:
      await runParent();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

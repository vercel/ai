import assert from 'node:assert/strict';
import {
  convertBase64ToUint8Array,
  detectMediaType,
} from '@ai-sdk/provider-utils';

async function main() {
  const bytes = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x04, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
  ]);
  const plainBase64 = Buffer.from(bytes).toString('base64');
  const formattedBase64 = `${' '.repeat(16)}${plainBase64}`;

  assert.deepEqual(
    convertBase64ToUint8Array(formattedBase64),
    bytes,
    'Reproduction setup failed: formatted base64 did not decode to the WebP bytes',
  );

  const rawResult = detectMediaType({ data: bytes, topLevelType: 'image' });
  const plainResult = detectMediaType({
    data: plainBase64,
    topLevelType: 'image',
  });
  const formattedResult = detectMediaType({
    data: formattedBase64,
    topLevelType: 'image',
  });

  assert.equal(
    rawResult,
    'image/webp',
    'Reproduction setup failed: raw WebP bytes were not detected',
  );
  assert.equal(
    plainResult,
    'image/webp',
    'Reproduction setup failed: compact WebP base64 was not detected',
  );
  assert.equal(
    formattedResult,
    'image/webp',
    `ISSUE_22797: expected whitespace-formatted WebP base64 to be detected as image/webp, received ${String(formattedResult)}`,
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

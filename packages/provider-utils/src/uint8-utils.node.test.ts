import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  convertBase64ToUint8Array,
  convertUint8ArrayToBase64,
} from './uint8-utils';

const reproductionByteLength = 14_078_689;
const expectedBase64Length = Math.ceil(reproductionByteLength / 3) * 4;

describe('convertUint8ArrayToBase64 memory regression', () => {
  it('encodes the reproduction-size array within a 128 MiB heap', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--input-type=module',
        '--eval',
        `
            ${convertUint8ArrayToBase64.toString()}

            const byteLength = ${reproductionByteLength};
            const bytes = new Uint8Array(byteLength);

            for (let index = 0; index < byteLength; index++) {
              bytes[index] = index % 256;
            }

            process.stdout.write(String(convertUint8ArrayToBase64(bytes).length));
          `,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(output).toBe(String(expectedBase64Length));
  }, 30_000);
});

describe('convertBase64ToUint8Array memory regression', () => {
  it('decodes the reproduction-size string within a 128 MiB heap without Uint8Array.fromBase64', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--input-type=module',
        '--eval',
        `
            const { atob } = globalThis;
            delete Uint8Array.fromBase64;

            ${convertBase64ToUint8Array.toString()}

            const byteLength = ${reproductionByteLength};
            const base64 = Buffer.alloc(byteLength, 0xab).toString('base64');
            const bytes = convertBase64ToUint8Array(base64);

            process.stdout.write(
              String(bytes.length === byteLength && bytes.every(byte => byte === 0xab)),
            );
          `,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(output).toBe('true');
  }, 30_000);
});

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { convertBase64ToUint8Array } from './uint8-utils';

const reproductionByteLength = 14_078_689;

describe('convertBase64ToUint8Array memory regression', () => {
  it('decodes the reproduction-size base64 within a 128 MiB heap', () => {
    const output = execFileSync(
      process.execPath,
      [
        '--max-old-space-size=128',
        '--input-type=module',
        '--eval',
        `
            const { atob } = globalThis;
            ${convertBase64ToUint8Array.toString()}

            const byteLength = ${reproductionByteLength};
            const bytes = new Uint8Array(byteLength);

            for (let index = 0; index < byteLength; index++) {
              bytes[index] = index % 256;
            }

            const base64 = Buffer.from(bytes.buffer).toString('base64');
            const decoded = convertBase64ToUint8Array(base64);

            let matches = decoded.length === byteLength;
            for (let index = 0; matches && index < byteLength; index++) {
              matches = decoded[index] === index % 256;
            }

            process.stdout.write(String(matches ? decoded.length : -1));
          `,
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );

    expect(output).toBe(String(reproductionByteLength));
  }, 30_000);
});

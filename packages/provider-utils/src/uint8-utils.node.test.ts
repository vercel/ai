import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { convertUint8ArrayToBase64 } from './uint8-utils';

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

import { describe, expect, it } from 'vitest';
import {
  truncatePiToolOutputHead,
  truncatePiToolOutputTail,
} from './pi-tool-result';

describe('Pi tool result truncation', () => {
  it('keeps small tool results unchanged', () => {
    expect(
      truncatePiToolOutputHead('small output', 'Continue another way.'),
    ).toBe('small output');
    expect(
      truncatePiToolOutputTail('small output', 'Continue another way.'),
    ).toBe('small output');
  });

  it('bounds single-line head output and adds continuation guidance', () => {
    const result = truncatePiToolOutputHead(
      'x'.repeat(1_000_000),
      'Call the tool again with narrower parameters.',
    );

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThan(64 * 1024);
    expect(result).toContain('Output truncated');
    expect(result).toContain('Call the tool again with narrower parameters.');
  });

  it('keeps the tail of oversized command output', () => {
    const result = truncatePiToolOutputTail(
      `${'first\n'.repeat(10_000)}last`,
      'Redirect the command to a file.',
    );

    expect(Buffer.byteLength(result, 'utf8')).toBeLessThan(64 * 1024);
    expect(result).not.toContain('first\n'.repeat(2_000));
    expect(result).toContain('last');
    expect(result).toContain('Output truncated');
    expect(result).toContain('Redirect the command to a file.');
  });
});

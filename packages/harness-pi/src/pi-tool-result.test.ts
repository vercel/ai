import { describe, expect, it } from 'vitest';
import {
  formatPiReadToolOutput,
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

  it('pages read output with an actionable next offset', () => {
    const text = Array.from(
      { length: 3_000 },
      (_, index) => `line ${index + 1}`,
    ).join('\n');

    const firstPage = formatPiReadToolOutput({
      text,
      filePath: 'large.txt',
    });
    expect(Buffer.byteLength(firstPage, 'utf8')).toBeLessThan(64 * 1024);
    expect(firstPage).toContain('line 1');
    expect(firstPage).toContain('Use offset=2001 to continue.');

    const nextPage = formatPiReadToolOutput({
      text,
      filePath: 'large.txt',
      offset: 2001,
      limit: 10,
    });
    expect(nextPage).toContain('line 2001');
    expect(nextPage).toContain('line 2010');
    expect(nextPage).not.toContain('line 2011');
    expect(nextPage).toContain('Use offset=2011 to continue.');
  });
});

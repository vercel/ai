import { describe, expect, it } from 'vitest';
import type { HarnessToolModelOutputContent } from '@ai-sdk/harness/utils';
import {
  formatPiReadToolOutput,
  truncatePiToolModelOutput,
  truncatePiToolOutputHead,
  truncatePiToolOutputTail,
} from './pi-tool-result';

describe('Pi tool result truncation', () => {
  const continuation = 'Call the tool again with narrower parameters.';
  const image: HarnessToolModelOutputContent = {
    type: 'image',
    data: 'iVBORw==',
    mediaType: 'image/png',
  };

  it.each([
    { content: [] },
    { content: [image] },
    { content: [{ type: 'text' as const, text: 'small' }, image] },
  ])('preserves untruncated content by reference: $content', ({ content }) => {
    expect(truncatePiToolModelOutput({ content, continuation })).toBe(content);
  });

  it.each(['x', '😀', '€'])(
    'bounds a single oversized %s text part safely',
    char => {
      const text = char.repeat(100_000);
      const content = [{ type: 'text' as const, text }];
      const result = truncatePiToolModelOutput({ content, continuation });
      expect(result).toEqual([
        { type: 'text', text: truncatePiToolOutputHead(text, continuation) },
      ]);
      expect(JSON.stringify(result)).not.toContain('�');
      expect(content[0].text).toBe(text);
    },
  );

  it.each([
    ['bytes', 'x'.repeat(30_000), 'y'.repeat(30_000)],
    [
      'lines',
      Array(1_501).fill('first').join('\n'),
      Array(1_001).fill('second').join('\n'),
    ],
  ])(
    'shares the %s budget across text parts and preserves every image',
    (limit, first, second) => {
      const content: HarnessToolModelOutputContent[] = [
        image,
        { type: 'text', text: first },
        image,
        { type: 'text', text: second },
        image,
        { type: 'text', text: 'omitted' },
        image,
      ];
      const original = structuredClone(content);
      const result = truncatePiToolModelOutput({ content, continuation });
      const text = result
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join('\n');
      expect(text).toBe(
        truncatePiToolOutputHead(`${first}\n${second}\nomitted`, continuation),
      );
      expect(text.match(/Output truncated/g)).toHaveLength(1);
      expect(result.filter(part => part.type === 'image')).toEqual([
        image,
        image,
        image,
        image,
      ]);
      expect(result[0]).toBe(image);
      expect(result.at(-1)).toBe(image);
      expect(result.map(part => part.type)).toEqual(
        limit === 'bytes'
          ? ['image', 'text', 'image', 'image', 'image']
          : ['image', 'text', 'image', 'text', 'image', 'image'],
      );
      expect(content).toEqual(original);
    },
  );

  it('inserts a notice at the first text position when no text is retained', () => {
    const content: HarnessToolModelOutputContent[] = [
      image,
      { type: 'text', text: '' },
      image,
      { type: 'text', text: 'x'.repeat(60_000) },
      image,
    ];
    expect(truncatePiToolModelOutput({ content, continuation })).toEqual([
      image,
      {
        type: 'text',
        text: truncatePiToolOutputHead(`\n${'x'.repeat(60_000)}`, continuation),
      },
      image,
      image,
    ]);
  });

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

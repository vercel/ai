import jscodeshift, { type API } from 'jscodeshift';
import { describe, expect, it, vi } from 'vitest';
import transformer from '../codemods/v5/restructure-file-stream-parts';
import { testTransform } from './test-utils';

describe('restructure-file-stream-parts', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'restructure-file-stream-parts');
  });

  it('leaves file stream part objects with spreads unchanged and reports them', () => {
    const source =
      "const chunk = { type: 'file', mimeType: 'image/png', ...payload };";
    const report = vi.fn();
    const j = jscodeshift.withParser('tsx');

    const output = transformer(
      { path: 'fixture.ts', source },
      {
        j,
        jscodeshift: j,
        stats: () => {},
        report,
      } as API,
      {},
    );

    expect(output).toBeNull();
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(
      'Could not automatically migrate a file stream part object with spread properties in fixture.ts. Please migrate it manually.',
    );
  });
});

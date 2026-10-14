import jscodeshift, { type API, type FileInfo } from 'jscodeshift';
import { describe, expect, it } from 'vitest';
import transformer from '../codemods/v5/flatten-streamtext-file-properties';
import { applyTransform, readFixture, testTransform } from './test-utils';

describe('flatten-streamtext-file-properties', () => {
  it('transforms correctly', () => {
    testTransform(transformer, 'flatten-streamtext-file-properties');
  });

  it('returns null for the fixture input', () => {
    const { content } = readFixture(
      'flatten-streamtext-file-properties',
      'input',
    );
    const fileInfo: FileInfo = {
      path: 'flatten-streamtext-file-properties.input.ts',
      source: content,
    };
    const j = jscodeshift.withParser('tsx');
    const api: API = {
      j,
      jscodeshift: j,
      stats: () => {},
      report: () => {},
    };

    let result: string | null | undefined;
    expect(() => {
      result = transformer(fileInfo, api, {});
    }).not.toThrow();
    expect(result).toBeNull();
  });

  it('keeps delta.file.mediaType readable on a streamText file part', () => {
    // Shape of a streamText `file` stream part: the media type stays on `file`.
    const filePart = {
      type: 'file' as const,
      file: { mediaType: 'image/png', base64: 'AA==' },
    };

    const source = 'function mediaType(delta) { return delta.file.mediaType; }';
    const transformed = applyTransform(transformer, source);
    expect(transformed).toContain('delta.file.mediaType');

    const readMediaType = new Function(
      'delta',
      `${transformed}; return mediaType(delta);`,
    ) as (delta: { file: { mediaType: string } }) => string;
    expect(readMediaType(filePart)).toBe('image/png');
  });

  it('preserves delta.file.data', () => {
    const transformed = applyTransform(
      transformer,
      'function readData(delta) { return delta.file.data; }',
    );
    expect(transformed).toContain('delta.file.data');
    expect(transformed).not.toContain('return delta.data');
  });
});

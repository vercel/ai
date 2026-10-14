import { streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
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

  it('keeps delta.file.mediaType readable on a streamText file part', async () => {
    const result = streamText({
      model: new MockLanguageModelV4({
        doStream: async () => ({
          stream: convertArrayToReadableStream([
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: 'AA==' },
            },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: 'stop' },
              usage: {
                inputTokens: {
                  total: 3,
                  noCache: 3,
                  cacheRead: undefined,
                  cacheWrite: undefined,
                },
                outputTokens: {
                  total: 10,
                  text: 10,
                  reasoning: undefined,
                },
              },
            },
          ]),
        }),
      }),
      prompt: 'test-input',
    });

    let filePart: { file: { mediaType: string } } | undefined;
    for await (const part of result.stream) {
      if (part.type === 'file') {
        filePart = part;
      }
    }

    expect(filePart?.file.mediaType).toBe('image/png');

    const source = 'function mediaType(delta) { return delta.file.mediaType; }';
    const transformed = applyTransform(transformer, source);
    expect(transformed).toContain('delta.file.mediaType');

    const readMediaType = new Function(
      'delta',
      `${transformed}; return mediaType(delta);`,
    ) as (delta: { file: { mediaType: string } }) => string;
    expect(readMediaType(filePart!)).toBe('image/png');
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

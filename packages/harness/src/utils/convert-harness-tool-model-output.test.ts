import { describe, expect, it } from 'vitest';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';
import { convertHarnessToolModelOutput } from './convert-harness-tool-model-output';

describe('convertHarnessToolModelOutput', () => {
  it.each([
    [{ type: 'text', value: 'hello' }, 'hello', false],
    [{ type: 'json', value: { ok: true } }, '{"ok":true}', false],
    [{ type: 'error-text', value: 'failed' }, 'failed', true],
    [
      { type: 'error-json', value: { error: 'failed' } },
      '{"error":"failed"}',
      true,
    ],
    [
      { type: 'execution-denied', reason: 'no permission' },
      'no permission',
      true,
    ],
    [{ type: 'execution-denied' }, 'Tool execution denied.', true],
  ] satisfies [ToolResultOutput, string, boolean][])(
    'converts %j',
    (output, text, isError) => {
      expect(convertHarnessToolModelOutput({ output })).toEqual({
        content: [{ type: 'text', text }],
        isError,
      });
    },
  );

  it('preserves ordered text and multiple images', () => {
    expect(
      convertHarnessToolModelOutput({
        output: {
          type: 'content',
          value: [
            { type: 'text', text: 'before' },
            {
              type: 'file',
              mediaType: 'image/png',
              data: { type: 'data', data: 'png' },
            },
            { type: 'text', text: 'after' },
            {
              type: 'file',
              mediaType: 'image/jpeg',
              data: { type: 'data', data: 'jpeg' },
            },
          ],
        },
      }),
    ).toEqual({
      content: [
        { type: 'text', text: 'before' },
        { type: 'image', mediaType: 'image/png', data: 'png' },
        { type: 'text', text: 'after' },
        { type: 'image', mediaType: 'image/jpeg', data: 'jpeg' },
      ],
      isError: false,
    });
  });
});
